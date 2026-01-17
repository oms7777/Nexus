// packages/backend/convex/private/repsPresence.ts
import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";

async function requireIdentity(ctx: any) {
  const id = await ctx.auth.getUserIdentity();
  if (!id) throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
  return id;
}

export const getMyPresence = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const id = await requireIdentity(ctx);
    const userId = id.subject as string;

    return await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q: any) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
      )
      .unique();
  },
});

export const setMyAvailability = mutation({
  args: { organizationId: v.string(), available: v.boolean() },
  handler: async (ctx, { organizationId, available }) => {
    const id = await requireIdentity(ctx);
    const userId = id.subject as string;

    const now = Date.now();

    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q: any) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { available, updatedAt: now });
      return existing._id;
    }

    // ✅ dernier recours: create (mais normalement ensureRepPresenceForMe le fait déjà)
    return await ctx.db.insert("repsPresence", {
      organizationId,
      userId,
      role: "sales",
      regions: [],
      available,
      updatedAt: now,
    });
  },
});

/**
 * Returns AVAILABLE reps enriched with user profile (name/avatar/title)
 */
export const listAvailableForOrg = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const reps = await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
      .collect();

    const available = reps.filter((r) => r.available === true);
    if (!available.length) return [];

    // users in org
    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
      .collect();

    const byExternalId = new Map<string, any>();
    for (const u of users) byExternalId.set(u.externalId, u);

    return available.map((r) => {
      const u = byExternalId.get(r.userId);
      return {
        userId: r.userId,
        available: r.available,
        name: (u?.name as string | undefined) ?? "Rep",
        avatarUrl: (u?.avatarUrl as string | undefined) ?? undefined,
        title: (u?.title as string | undefined) ?? undefined,
      };
    });
  },
});
