// packages/backend/convex/team.ts
import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

export const listRepsForOrg = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
  },
});

export const getRepForOrgUser = query({
  args: { organizationId: v.string(), userId: v.string() },
  handler: async (ctx, { organizationId, userId }) => {
    return await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
      )
      .unique();
  },
});

export const upsertRepPresence = mutation({
  args: {
    organizationId: v.string(),
    userId: v.string(),

    role: v.union(v.literal("sales"), v.literal("support")),
    regions: v.optional(v.array(v.string())),
    available: v.boolean(),

    slackUserId: v.optional(v.string()),
    slackDmChannel: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { organizationId, userId, role, regions, available, slackUserId, slackDmChannel },
  ) => {
    if (!organizationId || !userId) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "organizationId and userId are required",
      });
    }

    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
      )
      .unique();

    // ✅ Guard ONLY when creating a new rep doc
    if (!existing) {
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
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

      // count current reps
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

export const connectRepSlack = mutation({
  args: {
    organizationId: v.string(),
    userId: v.string(),
    slackUserId: v.string(),
    slackDmChannel: v.string(),
  },
  handler: async (ctx, { organizationId, userId, slackUserId, slackDmChannel }) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
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

    // ✅ Optional: respect rep limit here too (if you ever call connectRepSlack without prior upsert)
    // For now we keep behavior consistent with your existing code.

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
