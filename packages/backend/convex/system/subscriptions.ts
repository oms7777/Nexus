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

export const Addons = v.object({
  extraWebsites: v.number(),
  salesforce: v.boolean(),
  hubspot: v.boolean(),
  voice: v.boolean(),
  advancedAnalytics: v.boolean(),
  salesforcePlus: v.optional(v.boolean()),
  hubspotPlus: v.optional(v.boolean()),
  voicePlus: v.optional(v.boolean()),
});

export const Limits = v.object({
  reps: v.number(),
  websites: v.number(),
  monthlyEvents: v.number(),
  aiTokens: v.number(),
  voiceMinutes: v.number(),
  snapshotsGb: v.number(),
});

/* ----------------------------- Normalization ------------------------- */

/** Maps legacy subscription.addons (and Clerk/webhook re-patches) to the current shape. */
function normalizeAddons(a: Record<string, unknown> | undefined | null) {
  const x = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  const voice = Boolean(x.voice) || Boolean(x.voiceAi);
  return {
    extraWebsites: Math.max(0, Math.floor(Number(x.extraWebsites) || 0)),
    salesforce: Boolean(x.salesforce),
    hubspot: Boolean(x.hubspot),
    voice,
    advancedAnalytics: Boolean(x.advancedAnalytics),
    salesforcePlus: x.salesforcePlus === true,
    hubspotPlus: x.hubspotPlus === true,
    voicePlus: x.voicePlus === true,
  };
}

/* ----------------------------- Defaults ------------------------------ */

function defaultAddons() {
  return {
    extraWebsites: 0,
    salesforce: false,
    hubspot: false,
    voice: false,
    advancedAnalytics: false,
    salesforcePlus: false,
    hubspotPlus: false,
    voicePlus: false,
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

/** Sync org display name from Clerk webhooks so Convex `subscriptions` rows are human-readable in the dashboard. */
export const setOrganizationProfile = internalMutation({
  args: {
    organizationId: v.string(),
    organizationName: v.optional(v.string()),
    organizationSlug: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, organizationName, organizationSlug }) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (!existing) {
      return { ok: false as const, reason: "NOT_FOUND" as const };
    }

    const now = Date.now();
    const patch: {
      organizationName?: string;
      organizationSlug?: string;
      updatedAt: number;
    } = { updatedAt: now };

    if (organizationName !== undefined) patch.organizationName = organizationName;
    if (organizationSlug !== undefined) patch.organizationSlug = organizationSlug;

    await ctx.db.patch(existing._id, patch);
    return { ok: true as const };
  },
});

export const upsertFull = internalMutation({
  args: {
    organizationId: v.string(),
    plan: Plan,
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

/**
 * Normalizes every `subscriptions` row to the current schema (slim `addons`, no `enterpriseTier`).
 * Idempotent. Run before deploy if deploy fails on “extra field” in `.addons`.
 * `npx convex run internal/system/subscriptions:migrateSubscriptionShape`
 */
export const migrateSubscriptionShape = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("subscriptions").collect();
    const now = Date.now();
    let migrated = 0;

    for (const doc of rows) {
      const pa = doc.addons as Record<string, unknown>;
      const n = normalizeAddons(pa);
      /** Existing orgs keep Salesforce/HubSpot BYO UI unless explicitly disabled; Voice+ defaults off. */
      const addons = {
        ...n,
        salesforcePlus: typeof pa?.salesforcePlus === "boolean" ? pa.salesforcePlus : true,
        hubspotPlus: typeof pa?.hubspotPlus === "boolean" ? pa.hubspotPlus : true,
        voicePlus: typeof pa?.voicePlus === "boolean" ? pa.voicePlus : false,
      };

      await ctx.db.replace(doc._id, {
        organizationId: doc.organizationId,
        organizationName: doc.organizationName,
        organizationSlug: doc.organizationSlug,
        enterpriseTier: doc.enterpriseTier,
        plan: doc.plan,
        status: doc.status,
        addons,
        limits: doc.limits,
        startedAt: doc.startedAt,
        trialEndsAt: doc.trialEndsAt,
        endsAt: doc.endsAt,
        updatedAt: now,
      });
      migrated += 1;
    }

    return { ok: true, migrated };
  },
});
