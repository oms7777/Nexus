// packages/backend/convex/team.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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
 * Crée / met à jour un rep pour une org.
 * Utilisé par la page Admin pour assigner :
 * - rôle (sales/support)
 * - régions
 * - disponibilité
 * - ids Slack (plus tard)
 */
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
    { organizationId, userId, role, regions, available, slackUserId, slackDmChannel }
  ) => {
    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", userId)
      )
      .unique();

    const doc = {
      organizationId,
      userId,
      role,
      regions,
      available,
      slackUserId,
      slackDmChannel,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }

    const id = await ctx.db.insert("repsPresence", doc);
    return id;
  },
});
