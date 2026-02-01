import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

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
  handler: async (ctx, { userId, regions, available, slackUserId, slackDmChannel, profile }) => {
    const organizationId = await requireOrgId(ctx);
    if (!userId) throw new ConvexError({ code: "BAD_REQUEST", message: "userId is required" });

    await upsertUserProfileBestEffort(ctx, organizationId, userId, profile as any);

    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q: any) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
      )
      .unique();

    const now = Date.now();

    const payload: any = {
      organizationId,
      userId,
      available,
      updatedAt: now,
      regions: Array.isArray(regions) ? regions : [],
      slackUserId: slackUserId || undefined,
      slackDmChannel: slackDmChannel || undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("repsPresence", payload);
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
