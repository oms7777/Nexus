// packages/backend/convex/private/promos.ts
import { mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";

const rulesV = v.object({
  pathPrefix: v.optional(v.string()),
  urlIncludes: v.optional(v.array(v.string())),
  utmSource: v.optional(v.array(v.string())),
});

const ctaV = v.object({
  kind: v.union(
    v.literal("open_chat"),
    v.literal("open_booking"),
    v.literal("open_url"),
  ),
  label: v.string(),
  url: v.optional(v.string()),
});

const cardV = v.object({
  title: v.string(),
  body: v.string(),
  badgeText: v.optional(v.string()),
});

const targetRoleV = v.union(v.literal("sales"), v.literal("support"));

const identityModeV = v.union(
  v.literal("auto"),
  v.literal("logo"),
  v.literal("avatars"),
);

const ctaEmphasisModeV = v.union(
  v.literal("first_primary"),
  v.literal("last_primary"),
  v.literal("all_primary"),
  v.literal("none_primary"),
);

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

export const listByOrg = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = requireOrgId(identity);

    return await ctx.db
      .query("promos")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();
  },
});

export const upsert = mutation({
  args: {
    _id: v.optional(v.id("promos")),
    name: v.string(),
    active: v.boolean(),
    rules: rulesV,
    card: cardV,
    primaryCta: ctaV,
    secondaryCta: v.optional(ctaV),
    targetRole: v.optional(targetRoleV),
    identityMode: v.optional(identityModeV),

    // ⭐️ nouvelle liste multi-CTA
    ctaList: v.optional(v.array(ctaV)),
    ctaEmphasisMode: v.optional(ctaEmphasisModeV),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const organizationId = requireOrgId(identity);
    const now = Date.now();

    if (args._id) {
      const { _id, ...rest } = args;
      await ctx.db.patch(_id, {
        ...rest,
        organizationId,
        updatedAt: now,
      });
      return _id;
    }

    return await ctx.db.insert("promos", {
      organizationId,
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { _id: v.id("promos") },
  handler: async (ctx, { _id }) => {
    const identity = await ctx.auth.getUserIdentity();
    requireOrgId(identity);

    await ctx.db.delete(_id);
    return { ok: true };
  },
});
