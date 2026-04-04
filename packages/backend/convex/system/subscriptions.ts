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
  voice: v.boolean(),
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

/* ----------------------------- Normalization ------------------------- */

/** Maps legacy subscription.addons (and Clerk/webhook re-patches) to the current shape. */
function normalizeAddons(a: Record<string, unknown> | undefined | null) {
  const x = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  const voice = Boolean(x.voice) || Boolean(x.voiceAi);
  return {
    extraWebsites: Math.max(0, Math.floor(Number(x.extraWebsites) || 0)),
    salesforce: Boolean(x.salesforce),
    voice,
    advancedAnalytics: Boolean(x.advancedAnalytics),
  };
}

/* ----------------------------- Defaults ------------------------------ */

function defaultAddons() {
  return {
    extraWebsites: 0,
    salesforce: false,
    voice: false,
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
      await ctx.db.replace(doc._id, {
        organizationId: doc.organizationId,
        plan: doc.plan,
        status: doc.status,
        addons: normalizeAddons(doc.addons as Record<string, unknown>),
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
