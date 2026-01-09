// packages/backend/convex/system/subscriptions.ts
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

/* ----------------------------- Validators ----------------------------- */

export const Plan = v.union(
  v.literal("starter"),
  v.literal("growth"),
  v.literal("enterprise"),
);

export const Status = v.union(v.literal("active"), v.literal("paused"), v.literal("trial"));

export const EnterpriseTier = v.union(v.literal("light"), v.literal("core"), v.literal("heavy"));

// ✅ NEW: voice + voiceHighVolume
// ✅ KEEP: voiceAi / voiceAiHighVolume optional for backward compat
export const Addons = v.object({
  extraWebsites: v.number(),
  highVolumeTraffic: v.boolean(),
  salesforce: v.boolean(),

  // NEW
  voice: v.boolean(),
  voiceHighVolume: v.boolean(),

  // OLD (optional)
  voiceAi: v.optional(v.boolean()),
  voiceAiHighVolume: v.optional(v.boolean()),

  sso: v.boolean(),
  securityPackPlus: v.boolean(),
  compliancePack: v.boolean(),
  advancedAnalytics: v.boolean(),
});

export const Limits = v.object({
  reps: v.number(),
  websites: v.number(),
  monthlyEvents: v.number(),
  aiTokens: v.number(),
  voiceMinutes: v.number(),
  snapshotsGb: v.number(),
});

/* ----------------------------- Defaults ------------------------------ */

function defaultAddons() {
  return {
    extraWebsites: 0,
    highVolumeTraffic: false,
    salesforce: false,

    // NEW defaults
    voice: false,
    voiceHighVolume: false,

    // OLD kept (optional)
    // voiceAi: false,
    // voiceAiHighVolume: false,

    sso: false,
    securityPackPlus: false,
    compliancePack: false,
    advancedAnalytics: false,
  };
}

function defaultLimits() {
  return {
    reps: 3,
    websites: 1,
    monthlyEvents: 50_000,
    aiTokens: 2_000_000,
    voiceMinutes: 0,
    snapshotsGb: 0,
  };
}

function mapClerkStatusToLocal(s: string): "active" | "paused" | "trial" {
  const val = (s || "").toLowerCase();
  if (val === "active") return "active";
  if (val === "trial" || val === "trialing") return "trial";
  return "paused";
}

/* ------------------------------ Queries ------------------------------ */

export const getByOrganizationId = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();
  },
});

/* ----------------------------- Mutations ----------------------------- */

export const ensureForOrg = internalMutation({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (existing) return { ok: true, created: false, id: existing._id };

    const now = Date.now();

    const id = await ctx.db.insert("subscriptions", {
      organizationId,
      plan: "starter",
      status: "paused",
      addons: defaultAddons(),
      limits: defaultLimits(),
      startedAt: now,
      updatedAt: now,
    });

    return { ok: true, created: true, id };
  },
});

export const upsertFull = internalMutation({
  args: {
    organizationId: v.string(),
    plan: Plan,
    enterpriseTier: v.optional(EnterpriseTier),
    status: Status,
    addons: Addons,
    limits: Limits,
    startedAt: v.number(),
    trialEndsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    const now = Date.now();

    const payload = {
      organizationId: args.organizationId,
      plan: args.plan,
      enterpriseTier: args.enterpriseTier,
      status: args.status,
      addons: args.addons,
      limits: args.limits,
      startedAt: args.startedAt,
      trialEndsAt: args.trialEndsAt,
      endsAt: args.endsAt,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { ok: true, id: existing._id, created: false };
    }

    const id = await ctx.db.insert("subscriptions", payload);
    return { ok: true, id, created: true };
  },
});

export const setPlanForOrg = internalMutation({
  args: {
    organizationId: v.string(),
    plan: Plan,
    status: v.optional(Status),
  },
  handler: async (ctx, { organizationId, plan, status }) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    const now = Date.now();

    if (!existing) {
      const created = await ctx.db.insert("subscriptions", {
        organizationId,
        plan,
        status: status ?? "active",
        addons: defaultAddons(),
        limits: defaultLimits(),
        startedAt: now,
        updatedAt: now,
      });
      return { ok: true, id: created, created: true };
    }

    await ctx.db.patch(existing._id, {
      plan,
      status: status ?? existing.status,
      updatedAt: now,
    });

    return { ok: true, id: existing._id, created: false };
  },
});

export const setStatusFromClerk = internalMutation({
  args: {
    organizationId: v.string(),
    clerkStatus: v.string(),
  },
  handler: async (ctx, { organizationId, clerkStatus }) => {
    const status = mapClerkStatusToLocal(clerkStatus);

    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status,
        plan: (existing as any).plan ?? "starter",
        addons: (existing as any).addons ?? defaultAddons(),
        limits: (existing as any).limits ?? defaultLimits(),
        startedAt: (existing as any).startedAt ?? now,
        updatedAt: now,
      });
      return { ok: true, id: existing._id, created: false };
    }

    const id = await ctx.db.insert("subscriptions", {
      organizationId,
      plan: "starter",
      status,
      addons: defaultAddons(),
      limits: defaultLimits(),
      startedAt: now,
      updatedAt: now,
    });

    return { ok: true, id, created: true };
  },
});
