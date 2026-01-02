import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const listAvailableForOrg = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const presencesRaw = await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .filter((q) => q.eq(q.field("available"), true))
      .collect();

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
        role: p.role,
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

export const getMyPresence = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    if (!userId) return null;

    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
      )
      .unique();

    return (
      existing ?? {
        organizationId,
        userId,
        role: "sales" as const,
        regions: [],
        available: false,
      }
    );
  },
});

export const setMyAvailability = mutation({
  args: { organizationId: v.string(), available: v.boolean() },
  handler: async (ctx, { organizationId, available }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    if (!userId) throw new Error("UNAUTHORIZED");

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
        role: "sales",
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
