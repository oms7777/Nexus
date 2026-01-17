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

    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q: any) =>
        q.eq("organizationId", organizationId).eq("userId", userId),
      )
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { available, updatedAt: now });
      return existing._id;
    }

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
 * ✅ Returns AVAILABLE reps enriched with users profile (name/avatar/title)
 */
export const listAvailableForOrg = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const reps = await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
      .collect();

    const availableReps = reps.filter((r: any) => r.available);
    if (!availableReps.length) return [];

    // batch users for org
    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
      .collect();

    const byExternalId = new Map<string, any>();
    for (const u of users) byExternalId.set(u.externalId, u);

    return availableReps.map((r: any) => {
      const u = byExternalId.get(r.userId);
      const avatar = typeof u?.avatarUrl === "string" && u.avatarUrl.trim() ? u.avatarUrl.trim() : undefined;

      return {
        userId: r.userId,
        available: r.available,
        name: (u?.name as string | undefined) ?? "Rep",
        avatarUrl: avatar,
        title: (u?.title as string | undefined) ?? undefined,
      };
    });
  },
});
