// packages/backend/convex/private/billing.ts
import { query } from "../_generated/server";

export const isPro = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = identity?.orgId as string | undefined;
    if (!orgId) return { isPro: false };

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    return { isPro: sub?.status === "active" };
  },
});
