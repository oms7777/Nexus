// packages/backend/convex/private/promos.ts
import { mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";

type Plan = "starter" | "growth" | "enterprise";
type PathMode = "prefix" | "exact";

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

const pathModeV = v.union(v.literal("prefix"), v.literal("exact"));

const rulesV = v.object({
  pathPrefix: v.optional(v.string()),
  pathMode: v.optional(pathModeV),

  // legacy fields kept optional so older payloads won't break,
  // but the UI no longer uses them.
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
  imageUrl: v.optional(v.string()),
  videoUrl: v.optional(v.string()),
  videoPosterUrl: v.optional(v.string()),
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

const sequenceStepV = v.object({
  title: v.optional(v.string()),
  body: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  videoUrl: v.optional(v.string()),
  videoPosterUrl: v.optional(v.string()),
});

const promoSettingsV = v.object({
  sequenceEnabled: v.optional(v.boolean()),
  showDelayAfterNavMs: v.optional(v.number()),
  autoCloseMs: v.optional(v.number()),
  betweenPopupsMs: v.optional(v.number()),
  maxSequenceItems: v.optional(v.number()),
  animationPreset: v.optional(
    v.union(
      v.literal("soft_slide"),
      v.literal("ppt_pop"),
      v.literal("cinematic"),
      v.literal("none"),
    ),
  ),
  sequenceSteps: v.optional(v.array(sequenceStepV)),
});

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
    settings: v.optional(promoSettingsV),
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

      const patchPayload: any = {
        ...rest,
        organizationId,
        updatedAt: now,
      };

      // ✅ Do not force showNudge if not provided
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

    await requireAdvancedPromos(ctx, organizationId);

    await ctx.db.delete(_id);
    return { ok: true };
  },
});
