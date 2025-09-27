// packages/backend/convex/private/reps.ts
import { mutation, query } from "../_generated/server";
import { ConvexError, v } from "convex/values";

/** Pull org + user from Clerk identity injected in Convex. */
async function getAuth(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("UNAUTHENTICATED");

  const orgId = (identity as any).orgId as string | undefined;
  if (!orgId) throw new ConvexError("UNAUTHORIZED");

  return {
    orgId,
    userId: identity.subject as string,
    orgRole: (identity as any).orgRole as string | undefined, // "org:admin" | "org:member" (if present)
  };
}

/** Ensure the caller has a presence row (default: support / away). */
export const bootstrapMe = mutation({
  args: {},
  handler: async (ctx) => {
    const { orgId, userId } = await getAuth(ctx);

    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) => q.eq("organizationId", orgId).eq("userId", userId))
      .unique();

    if (existing) {
      // Touch updatedAt so we consider this user "fresh".
      await ctx.db.patch(existing._id, { updatedAt: Date.now() });
      return existing._id;
    }

    return await ctx.db.insert("repsPresence", {
      organizationId: orgId,
      userId,
      role: "support",
      regions: ["EMEA"],
      available: false,
      updatedAt: Date.now(),
    });
  },
});

/** Self-update role/availability/regions. */
export const setAvailability = mutation({
  args: {
    role: v.union(v.literal("sales"), v.literal("support")),
    available: v.boolean(),
    regions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { orgId, userId } = await getAuth(ctx);

    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) => q.eq("organizationId", orgId).eq("userId", userId))
      .unique();

    const doc = {
      organizationId: orgId,
      userId,
      role: args.role,
      regions: args.regions ?? existing?.regions ?? [],
      available: args.available,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }
    return await ctx.db.insert("repsPresence", doc);
  },
});

/** Admin: set role/regions for any org user (used by a Team page). */
export const setRoleForUser = mutation({
  args: {
    userId: v.string(),
    role: v.union(v.literal("sales"), v.literal("support")),
    regions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { orgId, orgRole } = await getAuth(ctx);
    if (orgRole !== "org:admin") throw new ConvexError("FORBIDDEN");

    const existing = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) => q.eq("organizationId", orgId).eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        regions: args.regions ?? existing.regions,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("repsPresence", {
      organizationId: orgId,
      userId: args.userId,
      role: args.role,
      regions: args.regions ?? ["EMEA"],
      available: false,
      updatedAt: Date.now(),
    });
  },
});

/** Current user's presence row (or null). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, userId } = await getAuth(ctx);
    const row = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) => q.eq("organizationId", orgId).eq("userId", userId))
      .unique();
    return row ?? null;
  },
});

/** For routing: available reps by role, fresh within last 10 minutes. */
export const listAvailableByRole = query({
  args: { role: v.union(v.literal("sales"), v.literal("support")) },
  handler: async (ctx, { role }) => {
    const { orgId } = await getAuth(ctx);
    const now = Date.now();

    const rows = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_role", (q) => q.eq("organizationId", orgId).eq("role", role))
      .collect();

    return rows.filter((r) => r.available && now - r.updatedAt < 10 * 60 * 1000);
  },
});

/** Optional: list all reps in org (for an Admin > Team screen). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await getAuth(ctx);
    return await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();
  },
});
