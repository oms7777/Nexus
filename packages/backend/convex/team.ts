// packages/backend/convex/team.ts
import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

async function requireOrgId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });

  const orgId = identity.orgId as string | undefined;
  if (!orgId) throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });

  return orgId;
}

/* ---------------- PRIVATE (dashboard) ---------------- */

export const listRepsForOrg = query({
  args: {},
  handler: async (ctx) => {
    const organizationId = await requireOrgId(ctx);

    return await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
  },
});

export const getRepForOrgUser = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const organizationId = await requireOrgId(ctx);

    return await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) => q.eq("organizationId", organizationId).eq("userId", userId))
      .unique();
  },
});

/* ---------------- ✅ PUBLIC SAFE (widget booking) ---------------- */

export const getRepForVisitor = query({
  args: {
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
    userId: v.string(),
  },
  handler: async (ctx, { organizationId, contactSessionId, userId }) => {
    const session = await ctx.db.get(contactSessionId);

    if (!session) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid session" });
    }
    if (session.organizationId !== organizationId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid org" });
    }
    if (session.expiresAt < Date.now()) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Session expired" });
    }

    return await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) => q.eq("organizationId", organizationId).eq("userId", userId))
      .unique();
  },
});

/* ---------------- MUTATIONS (dashboard) ---------------- */

export const upsertRepPresence = mutation({
  args: {
    userId: v.string(),
    role: v.union(v.literal("sales"), v.literal("support")),
    regions: v.optional(v.array(v.string())),
    available: v.boolean(),
    slackUserId: v.optional(v.string()),
    slackDmChannel: v.optional(v.string()),
  },
  handler: async (ctx, { userId, role, regions, available, slackUserId, slackDmChannel }) => {
    const organizationId = await requireOrgId(ctx);
    if (!userId) throw new ConvexError({ code: "BAD_REQUEST", message: "userId is required" });

    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) => q.eq("organizationId", organizationId).eq("userId", userId))
      .unique();

    const now = Date.now();

    const payload: any = {
      organizationId,
      userId,
      role,
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

    const id = await ctx.db.insert("repsPresence", payload);
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
      .withIndex("by_org_user", (q) => q.eq("organizationId", organizationId).eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { slackUserId, slackDmChannel, updatedAt: now });
      return existing._id;
    }

    // compat: create if missing
    const id = await ctx.db.insert("repsPresence", {
      organizationId,
      userId,
      role: "sales",
      regions: [],
      available: true,
      slackUserId,
      slackDmChannel,
      updatedAt: now,
    });

    return id;
  },
});
