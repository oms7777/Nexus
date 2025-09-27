import { mutation, query } from "../_generated/server";
import { ConvexError, v } from "convex/values";

function requireOrgId(identity: any): string {
  const orgId = identity?.orgId as string | undefined;
  if (!orgId) throw new ConvexError("UNAUTHORIZED");
  return orgId;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const organizationId = requireOrgId(identity);
    const rules = await ctx.db
      .query("routingRules")
      .withIndex("by_org_prio", (q) => q.eq("organizationId", organizationId))
      .collect();
    // tri par priority ASC (1 = plus haut)
    return rules.sort((a,b) => a.priority - b.priority).filter(r => r.enabled !== false);
  },
});

export const upsert = mutation({
  args: {
    _id: v.optional(v.id("routingRules")),
    name: v.string(),
    priority: v.number(),
    match: v.object({
      countries: v.optional(v.array(v.string())),
      urlIncludes: v.optional(v.array(v.string())),
      utmSource: v.optional(v.array(v.string())),
    }),
    routeTo: v.object({
      role: v.union(v.literal("sales"), v.literal("support")),
      regions: v.optional(v.array(v.string())),
      repIds: v.optional(v.array(v.string())),
    }),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const organizationId = requireOrgId(identity);
    if (args._id) {
      await ctx.db.patch(args._id, { ...args, organizationId });
      return args._id;
    }
    return await ctx.db.insert("routingRules", { ...args, organizationId });
  },
});
