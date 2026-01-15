// packages/backend/convex/public/snapshots.ts
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

const MAX_SNAPSHOT_BYTES = 1_500_000;  // 1.5MB max per snapshot
const KEEP_LAST = 25;

export const save = mutation({
  args: {
    organizationId: v.string(),
    sessionId: v.id("contactSessions"),
    snapshot: v.string(),
  },
  handler: async (ctx, { organizationId, sessionId, snapshot }) => {
    if (!snapshot) return { ok: false };

    const snapshotSize = new TextEncoder().encode(snapshot).length;
    if (snapshotSize > MAX_SNAPSHOT_BYTES) {
      return { ok: false, error: "Snapshot too large" };
    }

    const id = await ctx.db.insert("sessionSnapshots", {
      organizationId,
      sessionId,
      ts: Date.now(),
      snapshot,
    });

    // Remove old snapshots to prevent DB bloat
    const existing = await ctx.db.query("sessionSnapshots")
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
    return await ctx.db
      .query("sessionSnapshots")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(limit ?? 12);
  },
});
