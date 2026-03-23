// packages/backend/convex/private/nudges.ts
import { mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";

function requireOrgId(identity: any) {
  const orgId = identity?.orgId as string | undefined;
  if (!orgId) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Organization not found",
    });
  }
  return orgId;
}

type PathMode = "prefix" | "exact";

const pathModeV = v.union(v.literal("prefix"), v.literal("exact"));

const rulesV = v.object({
  pathPrefix: v.optional(v.string()),
  pathMode: v.optional(pathModeV),
});

const suggestionsV = v.object({
  suggestion1: v.optional(v.string()),
  suggestion2: v.optional(v.string()),
  suggestion3: v.optional(v.string()),
});

const settingsV = v.optional(
  v.object({
    sequenceCount: v.optional(v.number()),
    showDelayAfterNavMs: v.optional(v.number()),
    minDelayMs: v.optional(v.number()),
    autoCloseMs: v.optional(v.number()),
    betweenPopupsMs: v.optional(v.number()),
  }),
);

export const listByOrg = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = requireOrgId(identity);

    return await ctx.db
      .query("pageNudges")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();
  },
});

export const upsert = mutation({
  args: {
    _id: v.optional(v.id("pageNudges")),
    name: v.string(),
    active: v.boolean(),
    rules: rulesV,
    suggestions: suggestionsV,
    settings: settingsV,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = requireOrgId(identity);

    const now = Date.now();
    const insertShow = args.active ?? true;

    if (args._id) {
      const { _id, ...rest } = args;
      const patchPayload: any = {
        ...rest,
        organizationId: orgId,
        updatedAt: now,
      };
      await ctx.db.patch(_id, patchPayload);
      return _id;
    }

    return await ctx.db.insert("pageNudges", {
      organizationId: orgId,
      name: args.name,
      active: insertShow,
      rules: args.rules,
      suggestions: args.suggestions,
      settings: args.settings ?? undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { _id: v.id("pageNudges") },
  handler: async (ctx, { _id }) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = requireOrgId(identity);

    // Basic ownership check
    const doc = await ctx.db.get(_id);
    if (!doc || doc.organizationId !== orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Not allowed" });
    }

    await ctx.db.delete(_id);
    return { ok: true };
  },
});

