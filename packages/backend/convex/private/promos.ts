// packages/backend/convex/private/promos.ts
import { mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";

type Plan = "starter" | "growth" | "enterprise";

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

function isSubActive(sub: any) {
  const status = (sub?.status ?? "paused") as string;
  return status === "active" || status === "trial";
}

async function requireAdvancedPromos(ctx: any, organizationId: string) {
  const sub = await ctx.db
    .query("subscriptions")
    .withIndex("by_organization_id", (q: any) =>
      q.eq("organizationId", organizationId),
    )
    .unique();

  const plan = (sub?.plan ?? "starter") as Plan;

  if (!isSubActive(sub) || !(plan === "growth" || plan === "enterprise")) {
    throw new ConvexError({
      code: "PAYMENT_REQUIRED",
      message: "Page-based promos are available on Growth/Enterprise plans only.",
    });
  }
}

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
    showNudge: v.optional(v.boolean()),
    rules: rulesV,
    card: cardV,
    primaryCta: ctaV,
    secondaryCta: v.optional(ctaV),
    identityMode: v.optional(identityModeV),
    ctaList: v.optional(v.array(ctaV)),
    ctaEmphasisMode: v.optional(ctaEmphasisModeV),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const organizationId = requireOrgId(identity);

    await requireAdvancedPromos(ctx, organizationId);

    const now = Date.now();

    // ✅ DEFAULT only for inserts
    const insertShowNudge = args.showNudge ?? true;

    if (args._id) {
      const { _id, ...rest } = args;

      // ✅ Important: do NOT force showNudge to true on patch if user didn't send it
      const patchPayload: any = {
        ...rest,
        organizationId,
        updatedAt: now,
      };

      if (typeof args.showNudge === "boolean") {
        patchPayload.showNudge = args.showNudge;
      }

      await ctx.db.patch(_id, patchPayload);
      return _id;
    }

    return await ctx.db.insert("promos", {
      organizationId,
      ...args,
      showNudge: insertShowNudge,
      createdAt: now,
      updatedAt: now,
    });
  },
});


export const remove = mutation({
  args: { _id: v.id("promos") },
  handler: async (ctx, { _id }) => {
    const identity = await ctx.auth.getUserIdentity();
    const organizationId = requireOrgId(identity);

    // ✅ hard gate
    await requireAdvancedPromos(ctx, organizationId);

    await ctx.db.delete(_id);
    return { ok: true };
  },
});
