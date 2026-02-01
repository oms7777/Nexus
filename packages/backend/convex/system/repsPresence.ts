import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";

export const listAvailableForOrg = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, { organizationId }) => {
    const presencesRaw = await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .filter((q) => q.eq(q.field("available"), true))
      .collect();

    // optionnel: cap pour éviter N+1 trop grand
    const presences = presencesRaw.slice(0, 20);

    const out = [];
    for (const p of presences) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_org_external", (q) =>
          q.eq("organizationId", organizationId).eq("externalId", p.userId),
        )
        .unique();

      out.push({
        userId: p.userId,
        regions: p.regions ?? [],
        available: p.available,
        name: user?.name ?? undefined,
        avatarUrl: user?.avatarUrl ?? undefined,
        title: user?.title ?? undefined,
      });
    }

    return out;
  },
});

// optionnel: garde-le uniquement si vraiment utile en internal
export const setAvailability = internalMutation({
  args: {
    organizationId: v.string(),
    userId: v.string(),
    available: v.boolean(),
  },
  handler: async (ctx, { organizationId, userId, available }) => {
    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
      )
      .unique();

    const now = Date.now();

    if (!existing) {
      await ctx.db.insert("repsPresence", {
        organizationId,
        userId,
        regions: [],
        available,
        updatedAt: now,
      });
      return { ok: true };
    }

    await ctx.db.patch(existing._id, { available, updatedAt: now });
    return { ok: true };
  },
});
