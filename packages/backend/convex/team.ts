// packages/backend/convex/team.ts
import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

/**
 * Liste tous les reps d'une organisation (pour la page Admin Team).
 */
export const listRepsForOrg = query({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
  },
});

/**
 * Retourne un rep précis (org + userId).
 */
export const getRepForOrgUser = query({
  args: {
    organizationId: v.string(),
    userId: v.string(),
  },
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
    userId: v.string(), // Clerk userId

    role: v.union(v.literal("sales"), v.literal("support")),
    regions: v.optional(v.array(v.string())),
    available: v.boolean(),

    slackUserId: v.optional(v.string()),
    slackDmChannel: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      organizationId,
      userId,
      role,
      regions,
      available,
      slackUserId,
      slackDmChannel,
    },
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
 * Connect Slack pour UN rep : ne touche qu’aux champs Slack.
 */
export const connectRepSlack = mutation({
  args: {
    organizationId: v.string(),
    userId: v.string(),
    slackUserId: v.string(),
    slackDmChannel: v.string(),
  },
  handler: async (
    ctx,
    { organizationId, userId, slackUserId, slackDmChannel },
  ) => {
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
