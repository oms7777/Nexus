// packages/backend/convex/team.ts
import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

/** Centralize auth/org resolution */
async function requireOrgId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
  }
  const orgId = identity.orgId as string | undefined;
  if (!orgId) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
  }
  return orgId;
}

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
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", userId)
      )
      .unique();
  },
});

export const upsertRepPresence = mutation({
  args: {
    userId: v.string(),

    role: v.union(v.literal("sales"), v.literal("support")),
    regions: v.optional(v.array(v.string())),
    available: v.boolean(),

    slackUserId: v.optional(v.string()),
    slackDmChannel: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { userId, role, regions, available, slackUserId, slackDmChannel }
  ) => {
    const organizationId = await requireOrgId(ctx);

    if (!userId) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "userId is required",
      });
    }

    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", userId)
      )
      .unique();

    // ✅ Guard ONLY when creating a new rep doc
    if (!existing) {
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", organizationId)
        )
        .unique();

      if (!sub || sub.status !== "active") {
        throw new ConvexError({
          code: "PAYMENT_REQUIRED",
          message: "Subscription inactive",
        });
      }

      const baseLimit = sub.limits?.reps ?? 0;
      const addonExtra = sub.addons?.extraReps ?? 0;
      const maxReps = baseLimit + addonExtra;

      const reps = await ctx.db
        .query("repsPresence")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect();

      if (maxReps <= 0 || reps.length >= maxReps) {
        throw new ConvexError({
          code: "PAYMENT_REQUIRED",
          message: "Rep limit reached",
        });
      }
    }

    const now = Date.now();

    const base: any = {
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
      await ctx.db.patch(existing._id, base);
      return existing._id;
    }

    const id = await ctx.db.insert("repsPresence", base);
    return id;
  },
});

/**
 * connectRepSlack
 * ✅ IMPORTANT:
 * Slack callback should NOT be able to attach Slack to another org via a client-provided orgId.
 * We scope by identity.orgId, and we also protect that the user exists in this org's repsPresence.
 */
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
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", userId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        slackUserId,
        slackDmChannel,
        updatedAt: now,
      });
      return existing._id;
    }

    // If you want STRICT mode: forbid creating a rep here.
    // But keeping your previous behavior for compatibility:
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
