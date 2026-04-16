import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { writeAuditLog } from "./lib/audit";

async function requireOrgId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });

  const orgId = identity.orgId as string | undefined;
  if (!orgId) throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });

  return orgId;
}

async function upsertUserProfileBestEffort(
  ctx: any,
  organizationId: string,
  externalId: string,
  profile?: { name?: string; avatarUrl?: string; title?: string },
) {
  if (!profile) return;

  const existing = await ctx.db
    .query("users")
    .withIndex("by_org_external", (q: any) =>
      q.eq("organizationId", organizationId).eq("externalId", externalId),
    )
    .unique();

  const payload: any = {
    organizationId,
    externalId,
    updatedAt: Date.now(),
  };

  if (profile.name !== undefined) payload.name = profile.name || undefined;
  if (profile.avatarUrl !== undefined) payload.avatarUrl = profile.avatarUrl || undefined;
  if (profile.title !== undefined) payload.title = profile.title || undefined;

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return;
  }

  await ctx.db.insert("users", payload);
}

/* ---------------- PRIVATE (dashboard) ---------------- */

export const listRepsForOrg = query({
  args: {},
  handler: async (ctx) => {
    const organizationId = await requireOrgId(ctx);

    return await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
      .collect();
  },
});

export const getRepForOrgUser = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const organizationId = await requireOrgId(ctx);

    return await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q: any) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
      )
      .unique();
  },
});

export const ensureRepPresenceForMe = mutation({
  args: {
    available: v.optional(v.boolean()),
  },
  handler: async (ctx, { available }) => {
    const organizationId = await requireOrgId(ctx);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });

    const userId = identity.subject as string;
    const now = Date.now();

    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q: any) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        available: available ?? existing.available,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("repsPresence", {
      organizationId,
      userId,
      regions: [],
      available: available ?? true,
      updatedAt: now,
    });
  },
});

/** Rep saves their own WhatsApp (wa.me); digits only stored after normalization. */
export const setMyWhatsAppPhone = mutation({
  args: {
    whatsappPhoneDigits: v.optional(v.string()),
  },
  handler: async (ctx, { whatsappPhoneDigits }) => {
    const organizationId = await requireOrgId(ctx);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const userId = identity.subject as string;
    const raw = String(whatsappPhoneDigits ?? "").replace(/\D/g, "");
    if (raw.length > 0 && (raw.length < 8 || raw.length > 15)) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "WhatsApp number must include country code (8–15 digits).",
      });
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q: any) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
      )
      .unique();

    const payload: { whatsappPhoneDigits?: string; updatedAt: number } = {
      updatedAt: now,
    };
    payload.whatsappPhoneDigits = raw.length > 0 ? raw : undefined;

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("repsPresence", {
      organizationId,
      userId,
      regions: [],
      available: true,
      whatsappPhoneDigits: payload.whatsappPhoneDigits,
      updatedAt: now,
    });
  },
});

/* ---------------- PUBLIC SAFE (widget booking) ---------------- */

export const getRepForVisitor = query({
  args: {
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
    userId: v.string(),
  },
  handler: async (ctx, { organizationId, contactSessionId, userId }) => {
    const session = await ctx.db.get(contactSessionId);

    if (!session) throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid session" });
    if (session.organizationId !== organizationId)
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid org" });
    if (session.expiresAt < Date.now())
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Session expired" });

    return await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q: any) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
      )
      .unique();
  },
});

/* ---------------- MUTATIONS (dashboard) ---------------- */

export const upsertRepPresence = mutation({
  args: {
    userId: v.string(),
    regions: v.optional(v.array(v.string())),
    available: v.boolean(),
    whatsappPhoneDigits: v.optional(v.string()),
    slackUserId: v.optional(v.string()),
    slackDmChannel: v.optional(v.string()),
    profile: v.optional(
      v.object({
        name: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
        title: v.optional(v.string()),
      }),
    ),
  },
  handler: async (
    ctx,
    { userId, regions, available, whatsappPhoneDigits, slackUserId, slackDmChannel, profile },
  ) => {
    const organizationId = await requireOrgId(ctx);
    if (!userId) throw new ConvexError({ code: "BAD_REQUEST", message: "userId is required" });

    const identity = await ctx.auth.getUserIdentity();
    const actorUserId = (identity as any)?.subject as string | undefined;
    const actorOrgRole =
      ((identity as any)?.orgRole ??
        (identity as any)?.org_role ??
        (identity as any)?.organizationRole ??
        undefined) as string | undefined;

    await upsertUserProfileBestEffort(ctx, organizationId, userId, profile as any);

    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q: any) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
      )
      .unique();

    const now = Date.now();

    const prevRegions = Array.isArray((existing as any)?.regions) ? ((existing as any).regions as string[]) : [];
    const nextRegions = Array.isArray(regions) ? regions : [];
    const regionsChanged =
      regions !== undefined &&
      (prevRegions.length !== nextRegions.length || prevRegions.some((r, i) => r !== nextRegions[i]));

    const waRaw = String(whatsappPhoneDigits ?? "").replace(/\D/g, "");
    const waDigits =
      waRaw.length > 0 && waRaw.length >= 8 && waRaw.length <= 15 ? waRaw : undefined;

    const payload: any = {
      organizationId,
      userId,
      available,
      updatedAt: now,
      regions: Array.isArray(regions) ? regions : [],
      slackUserId: slackUserId || undefined,
      slackDmChannel: slackDmChannel || undefined,
    };

    if (whatsappPhoneDigits !== undefined) {
      payload.whatsappPhoneDigits = waDigits;
    }

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      if (regionsChanged) {
        await writeAuditLog(ctx, {
          organizationId,
          actorUserId,
          actorOrgRole,
          action: "rep.territories.updated",
          entityType: "rep",
          entityId: String(userId),
          meta: { userId, prevRegions, nextRegions },
        });
      }
      return existing._id;
    }

    const id = await ctx.db.insert("repsPresence", payload);
    if (regionsChanged) {
      await writeAuditLog(ctx, {
        organizationId,
        actorUserId,
        actorOrgRole,
        action: "rep.territories.updated",
        entityType: "rep",
        entityId: String(userId),
        meta: { userId, prevRegions: [], nextRegions },
      });
    }
    return id;
  },
});

export const connectRepSlack = mutation({
  args: {
    userId: v.string(),
    slackUserId: v.string(),
    slackDmChannel: v.string(),
  },
  handler: async (ctx, { userId, slackUserId, slackDmChannel }) => {
    const organizationId = await requireOrgId(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q: any) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { slackUserId, slackDmChannel, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("repsPresence", {
      organizationId,
      userId,
      regions: [],
      available: true,
      slackUserId,
      slackDmChannel,
      updatedAt: now,
    });
  },
});
