// packages/backend/convex/private/promos.ts
import { mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { requireOrgManager } from "../lib/authz";

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

/** Any active or trial subscription can manage page promos (Starter included). */
async function requirePromoSubscription(ctx: any, organizationId: string) {
  const sub = await ctx.db
    .query("subscriptions")
    .withIndex("by_organization_id", (q: any) =>
      q.eq("organizationId", organizationId),
    )
    .unique();

  if (!isSubActive(sub)) {
    throw new ConvexError({
      code: "PAYMENT_REQUIRED",
      message:
        "An active subscription is required to manage promos. Start a trial or upgrade your plan.",
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

const nudgeSizeV = v.union(
  v.literal("sm"),
  v.literal("md"),
  v.literal("lg"),
  v.literal("xl"),
);

const mediaPlacementV = v.union(
  v.literal("top"),
  v.literal("bottom"),
  v.literal("left"),
  v.literal("right"),
  v.literal("framed"),
);

const mediaHeightV = v.union(
  v.literal("compact"),
  v.literal("standard"),
  v.literal("tall"),
  v.literal("hero"),
);

const nudgeTextAlignV = v.union(
  v.literal("left"),
  v.literal("center"),
  v.literal("right"),
);

const nudgeContentBlockV = v.union(
  v.object({
    type: v.literal("text"),
    id: v.string(),
    text: v.string(),
    align: v.optional(nudgeTextAlignV),
  }),
  v.object({
    type: v.literal("image"),
    id: v.string(),
    url: v.string(),
  }),
  v.object({
    type: v.literal("video"),
    id: v.string(),
    url: v.string(),
  }),
);

const cardV = v.object({
  title: v.string(),
  body: v.string(),
  imageUrl: v.optional(v.string()),
  videoUrl: v.optional(v.string()),
  nudgeSize: v.optional(nudgeSizeV),
  mediaPlacement: v.optional(mediaPlacementV),
  mediaHeight: v.optional(mediaHeightV),
  fullFrameStackMedia: v.optional(v.boolean()),
  contentBlocks: v.optional(v.array(nudgeContentBlockV)),
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
  ctaList: v.optional(v.array(ctaV)),
  ctaEmphasisMode: v.optional(ctaEmphasisModeV),
  nudgeSize: v.optional(nudgeSizeV),
  mediaPlacement: v.optional(mediaPlacementV),
  mediaHeight: v.optional(mediaHeightV),
  fullFrameStackMedia: v.optional(v.boolean()),
  contentBlocks: v.optional(v.array(nudgeContentBlockV)),
});

const promoSettingsV = v.object({
  sequenceEnabled: v.optional(v.boolean()),
  sequenceLoop: v.optional(v.boolean()),
  sequenceRandomOrder: v.optional(v.boolean()),
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
    const { orgId } = await requireOrgManager(ctx);

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
    const { orgId: organizationId, userId, orgRole } = await requireOrgManager(ctx);

    await requirePromoSubscription(ctx, organizationId);

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

      await ctx.runMutation((internal as any).system.audit.log, {
        organizationId,
        actorUserId: userId,
        actorOrgRole: orgRole,
        action: "promo.updated",
        entityType: "promo",
        entityId: String(_id),
        meta: { name: args.name, active: args.active },
      });
      return _id;
    }

    const createdId = await ctx.db.insert("promos", {
      organizationId,
      ...args,
      showNudge: insertShowNudge,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation((internal as any).system.audit.log, {
      organizationId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "promo.created",
      entityType: "promo",
      entityId: String(createdId),
      meta: { name: args.name, active: args.active },
    });

    return createdId;
  },
});

export const remove = mutation({
  args: { _id: v.id("promos") },
  handler: async (ctx, { _id }) => {
    const { orgId: organizationId, userId, orgRole } = await requireOrgManager(ctx);

    await requirePromoSubscription(ctx, organizationId);

    await ctx.db.delete(_id);

    await ctx.runMutation((internal as any).system.audit.log, {
      organizationId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "promo.deleted",
      entityType: "promo",
      entityId: String(_id),
    });
    return { ok: true };
  },
});
