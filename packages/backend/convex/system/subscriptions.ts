// packages/backend/convex/system/subscriptions.ts
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

const Plan = v.union(v.literal("starter"), v.literal("growth"), v.literal("enterprise"));
const Status = v.union(v.literal("active"), v.literal("paused"), v.literal("trial"));
const EnterpriseTier = v.union(v.literal("light"), v.literal("core"), v.literal("heavy"));

const Addons = v.object({
  extraWebsites: v.number(),
  extraReps: v.number(),
  highVolumeTraffic: v.boolean(),
  salesforce: v.boolean(),
  voiceAi: v.boolean(),
  voiceAiHighVolume: v.boolean(),
  sso: v.boolean(),
  securityPackPlus: v.boolean(),
  compliancePack: v.boolean(),
  advancedAnalytics: v.boolean(),
});

const Limits = v.object({
  websites: v.number(),
  reps: v.number(),
  monthlyEvents: v.number(),
  aiTokens: v.number(),
  voiceMinutes: v.number(),
  snapshotsGb: v.number(),
});

function defaultAddons() {
  return {
    extraWebsites: 0,
    extraReps: 0,
    highVolumeTraffic: false,
    salesforce: false,
    voiceAi: false,
    voiceAiHighVolume: false,
    sso: false,
    securityPackPlus: false,
    compliancePack: false,
    advancedAnalytics: false,
  };
}

function defaultLimits() {
  return {
    websites: 1,
    reps: 1,
    monthlyEvents: 50_000,
    aiTokens: 2_000_000,
    voiceMinutes: 0,
    snapshotsGb: 0,
  };
}

/**
 * Clerk renvoie des statuts "string" (et pas forcément ton union).
 * On mappe proprement.
 */
function mapClerkStatusToLocal(s: string): "active" | "paused" | "trial" {
  const v = (s || "").toLowerCase();

  // adapte ici selon ce que Clerk t'envoie réellement
  if (v === "active") return "active";
  if (v === "trial" || v === "trialing") return "trial";

  // tout le reste => paused (graceful)
  return "paused";
}

export const getByOrganizationId = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();
  },
});

/**
 * Upsert complet (admin/settings)
 */
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
      return existing._id;
    }
    return await ctx.db.insert("subscriptions", payload);
  },
});

/**
 * Webhook Clerk: update status only (mais garde schema OK via defaults)
 */
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
      // si ancien doc incomplet: on backfill en même temps
      await ctx.db.patch(existing._id, {
        status,
        plan: (existing as any).plan ?? "starter",
        addons: (existing as any).addons ?? defaultAddons(),
        limits: (existing as any).limits ?? defaultLimits(),
        startedAt: (existing as any).startedAt ?? now,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("subscriptions", {
      organizationId,
      plan: "starter",
      status,
      addons: defaultAddons(),
      limits: defaultLimits(),
      startedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * ✅ Migration: patch tous les anciens docs "legacy"
 * (à lancer une seule fois)
 */
export const backfillAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const subs = await ctx.db.query("subscriptions").collect();
    const now = Date.now();

    for (const s of subs) {
      await ctx.db.patch(s._id, {
        plan: (s as any).plan ?? "starter",
        addons: (s as any).addons ?? defaultAddons(),
        limits: (s as any).limits ?? defaultLimits(),
        startedAt: (s as any).startedAt ?? now,
        updatedAt: now,
      });
    }

    return { ok: true, count: subs.length };
  },
});
