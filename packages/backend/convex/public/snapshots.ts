// packages/backend/convex/public/snapshots.ts
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

// ✅ hard guard to prevent huge payloads from freezing UIs
const MAX_SNAPSHOT_BYTES = 1_500_000; // 1.5MB (adjust if needed)

// ✅ keep only last N snapshots per session (avoid unbounded growth)
const KEEP_LAST = 25;

/**
 * Sauvegarde un snapshot de page pour une session
 * (on autorise plusieurs snapshots par session = historique)
 */
export const save = mutation({
  args: {
    organizationId: v.string(),
    sessionId: v.id("contactSessions"),
    pageUrl: v.optional(v.string()),
    title: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    snapshot: v.string(), // JSON rrweb stringifié
  },
  handler: async (ctx, args) => {
    const { organizationId, sessionId, snapshot, pageUrl, title, width, height } = args;

    if (!snapshot) return { ok: false };

    // ✅ size guard
    const snapshotSize = new TextEncoder().encode(snapshot).length;
    if (snapshotSize > MAX_SNAPSHOT_BYTES) {
      return { ok: false, error: "Snapshot too large" };
    }

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

    // ✅ prune old snapshots (best effort)
    const existing = await ctx.db
      .query("sessionSnapshots")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(KEEP_LAST + 10); // a bit more so pruning works reliably

    if (existing.length > KEEP_LAST) {
      const toDelete = existing.slice(KEEP_LAST);
      for (const row of toDelete) {
        await ctx.db.delete(row._id);
      }
    }

    return { ok: true, id };
  },
});

/**
 * Liste des snapshots d'une session
 */
export const listRecent = query({
  args: {
    sessionId: v.id("contactSessions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, limit }) => {
    return await ctx.db
      .query("sessionSnapshots")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(limit ?? 12);
  },
});
