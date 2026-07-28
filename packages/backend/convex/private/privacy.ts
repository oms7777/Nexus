// packages/backend/convex/private/privacy.ts
import { ConvexError, v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { requireOrgAdmin, requireOrgId } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";
import { SNAPSHOT_RETENTION, snapshotRetentionDays } from "../public/snapshots";

/**
 * GDPR operations on visitor data.
 *
 * Session replay is the most sensitive thing stored: full DOM captures of someone
 * else's browsing. Retention is therefore enforced by a cron rather than left to
 * per-session pruning, and an admin can erase a single visitor on request.
 */

/**
 * Deliberately small: deleting a row requires reading it, and a snapshot can weigh up
 * to 2 MB, so a large batch would exceed the per-transaction read limit.
 */
const SNAPSHOT_PURGE_BATCH = 20;
/** Upper bound on batches per sweep, so one run cannot loop forever. */
const MAX_BATCHES_PER_SWEEP = 50;
/** Rate limit rows are tiny, so they can be cleared in bigger chunks. */
const RATE_LIMIT_PURGE_BATCH = 500;
/** A bucket older than this can never be inside an active window. */
const RATE_LIMIT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const listOrganizationsWithRetention = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<{ organizationId: string; retentionDays: number }>> => {
    // `subscriptions` holds exactly one row per organization, so it is the cheapest
    // reliable way to enumerate tenants.
    const subscriptions = await ctx.db.query("subscriptions").collect();

    const out: Array<{ organizationId: string; retentionDays: number }> = [];

    for (const sub of subscriptions) {
      const settings = await ctx.db
        .query("widgetSettings")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", sub.organizationId))
        .unique();

      out.push({
        organizationId: sub.organizationId,
        retentionDays: snapshotRetentionDays(settings?.snapshotRetentionDays),
      });
    }

    return out;
  },
});

export const purgeSnapshotBatchForOrg = internalMutation({
  args: {
    organizationId: v.string(),
    retentionDays: v.number(),
  },
  handler: async (ctx, { organizationId, retentionDays }) => {
    const cutoff = Date.now() - snapshotRetentionDays(retentionDays) * 24 * 60 * 60 * 1000;

    // Derived from `ts`, so rows written before retention shipped are covered too,
    // and lowering the setting immediately shortens the window for stored rows.
    const stale = await ctx.db
      .query("sessionSnapshots")
      .withIndex("by_org_ts", (q) => q.eq("organizationId", organizationId).lte("ts", cutoff))
      .take(SNAPSHOT_PURGE_BATCH);

    for (const row of stale) {
      await ctx.db.delete(row._id);
    }

    return { purged: stale.length, hasMore: stale.length === SNAPSHOT_PURGE_BATCH };
  },
});

export const purgeStaleRateLimitBuckets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RATE_LIMIT_MAX_AGE_MS;

    // One row per visitor session; without this the table would grow forever.
    const stale = await ctx.db
      .query("aiRateLimits")
      .filter((q) => q.lt(q.field("windowStartedAt"), cutoff))
      .take(RATE_LIMIT_PURGE_BATCH);

    for (const row of stale) {
      await ctx.db.delete(row._id);
    }

    return { purged: stale.length };
  },
});

/**
 * Retention sweep. An action rather than a single mutation so deletions run as many
 * small transactions instead of one oversized one.
 */
export const runRetentionSweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ purgedSnapshots: number; purgedRateLimits: number }> => {
    const orgs = await ctx.runQuery(internal.private.privacy.listOrganizationsWithRetention, {});

    let purgedSnapshots = 0;
    let batches = 0;

    for (const org of orgs) {
      let hasMore = true;

      while (hasMore && batches < MAX_BATCHES_PER_SWEEP) {
        const res = await ctx.runMutation(internal.private.privacy.purgeSnapshotBatchForOrg, {
          organizationId: org.organizationId,
          retentionDays: org.retentionDays,
        });

        purgedSnapshots += res.purged;
        hasMore = res.hasMore;
        batches += 1;
      }

      if (batches >= MAX_BATCHES_PER_SWEEP) {
        console.log("[privacy] sweep hit its batch cap; remaining rows go to the next run");
        break;
      }
    }

    const rateLimits: { purged: number } = await ctx.runMutation(
      internal.private.privacy.purgeStaleRateLimitBuckets,
      {},
    );

    if (purgedSnapshots > 0 || rateLimits.purged > 0) {
      console.log(
        `[privacy] sweep purged ${purgedSnapshots} snapshot(s) and ${rateLimits.purged} rate limit bucket(s)`,
      );
    }

    return { purgedSnapshots, purgedRateLimits: rateLimits.purged };
  },
});

export const getRetentionSettings = query({
  args: {},
  handler: async (ctx) => {
    const orgId = await requireOrgId(ctx);

    const settings = await ctx.db
      .query("widgetSettings")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    return {
      snapshotRetentionDays: settings?.snapshotRetentionDays ?? SNAPSHOT_RETENTION.defaultDays,
      minDays: SNAPSHOT_RETENTION.minDays,
      maxDays: SNAPSHOT_RETENTION.maxDays,
      defaultDays: SNAPSHOT_RETENTION.defaultDays,
    };
  },
});

export const setSnapshotRetentionDays = mutation({
  args: { days: v.number() },
  handler: async (ctx, { days }) => {
    const { orgId, userId, orgRole } = await requireOrgAdmin(ctx);

    const value = Math.floor(days);
    if (
      !Number.isFinite(value) ||
      value < SNAPSHOT_RETENTION.minDays ||
      value > SNAPSHOT_RETENTION.maxDays
    ) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `Retention must be between ${SNAPSHOT_RETENTION.minDays} and ${SNAPSHOT_RETENTION.maxDays} days.`,
      });
    }

    const settings = await ctx.db
      .query("widgetSettings")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    if (!settings) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Configure your widget settings first.",
      });
    }

    // Retention is evaluated against `ts` at sweep time, so the new window applies to
    // recordings already stored without rewriting any row here.
    await ctx.db.patch(settings._id, { snapshotRetentionDays: value });

    await writeAuditLog(ctx, {
      organizationId: orgId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "privacy.set_snapshot_retention",
      entityType: "widgetSettings",
      entityId: String(settings._id),
      meta: { days: value },
    });

    return { ok: true as const, days: value };
  },
});

/**
 * Right to erasure for one visitor. Deletes replay data, analytics events and the
 * identifying fields of the contact session. Conversations are kept but stripped of
 * identity, because deleting them would corrupt the customer's own reporting.
 */
export const eraseVisitor = mutation({
  args: { contactSessionId: v.id("contactSessions") },
  handler: async (ctx, { contactSessionId }) => {
    const { orgId, userId, orgRole } = await requireOrgAdmin(ctx);

    const session = await ctx.db.get(contactSessionId);
    if (!session || session.organizationId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Visitor session not found" });
    }

    const snapshots = await ctx.db
      .query("sessionSnapshots")
      .withIndex("by_session", (q) => q.eq("sessionId", contactSessionId))
      .collect();

    for (const row of snapshots) {
      await ctx.db.delete(row._id);
    }

    const events = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_session", (q) => q.eq("sessionId", contactSessionId))
      .collect();

    for (const row of events) {
      await ctx.db.delete(row._id);
    }

    // Anonymize rather than delete: the session is referenced by conversations.
    await ctx.db.patch(contactSessionId, {
      name: "Erased visitor",
      email: `erased+${contactSessionId}@example.invalid`,
      metadata: undefined,
      expiresAt: Date.now(),
    });

    await writeAuditLog(ctx, {
      organizationId: orgId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "privacy.erase_visitor",
      entityType: "contactSessions",
      entityId: String(contactSessionId),
      meta: { snapshotsDeleted: snapshots.length, eventsDeleted: events.length },
    });

    return {
      ok: true as const,
      snapshotsDeleted: snapshots.length,
      eventsDeleted: events.length,
    };
  },
});
