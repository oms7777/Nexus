// packages/backend/convex/system/entitlements.ts
import { internalQuery } from "../_generated/server";
import { ConvexError } from "convex/values";

export const getCurrent = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = identity?.orgId as string | undefined;

    if (!orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "No org" });
    }

    // ✅ MAJ: pas de internal.* ici (évite circular typing)
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    return sub; // null si pas encore créé
  },
});
