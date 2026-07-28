import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { normalizeHostname } from "../lib/domains";

// Guard simple (Convex runtime: éviter TextEncoder)
const MAX_SNAPSHOT_CHARS = 2_000_000; // ~2MB-ish worst case (ajuste si besoin)
const KEEP_LAST = 25;

/** Retention bounds for session replay. Kept short by default. */
export const SNAPSHOT_RETENTION = {
  defaultDays: 30,
  minDays: 1,
  maxDays: 365,
};

/** Clamps a stored setting into the allowed window, falling back to the default. */
export function snapshotRetentionDays(days: unknown): number {
  const raw = Number(days);
  if (!Number.isFinite(raw)) return SNAPSHOT_RETENTION.defaultDays;
  return Math.min(
    Math.max(Math.floor(raw), SNAPSHOT_RETENTION.minDays),
    SNAPSHOT_RETENTION.maxDays,
  );
}

export const save = mutation({
  args: {
    organizationId: v.string(),
    sessionId: v.id("contactSessions"),

    // ✅ compat: optionnels (au cas où ton API route les envoie encore)
    pageUrl: v.optional(v.string()),
    title: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),

    snapshot: v.string(),
  },
  handler: async (ctx, args) => {
    const { organizationId, sessionId, snapshot, pageUrl, title, width, height } = args;

    if (!snapshot) return { ok: false };

    // ✅ Enforce domain allowlist when we can.
    if (pageUrl) {
      const host = (() => {
        try {
          return new URL(pageUrl).hostname;
        } catch {
          return null;
        }
      })();
      const normalized = host ? normalizeHostname(host) : null;
      if (normalized) {
        const res = await ctx.runQuery((internal as any).system.websites.isAllowedHostnameForOrg, {
          organizationId,
          hostname: normalized,
        });
        if (!res.allowed) return { ok: false, error: "Domain not allowed" };
      }
    }

    // ✅ guard simple (pas de TextEncoder ici)
    if (snapshot.length > MAX_SNAPSHOT_CHARS) {
      return { ok: false, error: "Snapshot too large" };
    }

    // Retention is enforced by the sweep in `private/privacy.ts`, from `ts` and the
    // organization's current setting — nothing to stamp here.
    const id = await ctx.db.insert("sessionSnapshots", {
      organizationId,
      sessionId,
      ts: Date.now(),
      pageUrl,
      title,
      width,
      height,
      snapshot,
    });

    // ✅ prune: garde uniquement les derniers KEEP_LAST
    const existing = await ctx.db
      .query("sessionSnapshots")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(KEEP_LAST + 10);

    if (existing.length > KEEP_LAST) {
      const toDelete = existing.slice(KEEP_LAST);
      for (const row of toDelete) {
        await ctx.db.delete(row._id);
      }
    }

    return { ok: true, id };
  },
});

export const listRecent = query({
  args: {
    sessionId: v.id("contactSessions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, limit }) => {
    // Same ordering as private/live.ts: newest `ts` first (not only insertion order on by_session).
    return await ctx.db
      .query("sessionSnapshots")
      .withIndex("by_session_ts", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(limit ?? 12);
  },
});
