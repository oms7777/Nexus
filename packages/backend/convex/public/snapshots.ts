// packages/backend/convex/public/snapshots.ts
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

const MAX_SNAPSHOT_CHARS = 50_000; // V1: tiny payload only
const KEEP_LAST = 50;

export const save = mutation({
  args: {
    organizationId: v.string(),
    sessionId: v.id("contactSessions"),

    pageUrl: v.optional(v.string()),
    title: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),

    // V1: keep as string (compat) but it’s not rrweb anymore
    snapshot: v.string(),
  },
  handler: async (ctx, args) => {
    const { organizationId, sessionId, snapshot, pageUrl, title, width, height } = args;

    if (!snapshot) return { ok: false };

    if (snapshot.length > MAX_SNAPSHOT_CHARS) {
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
      snapshot, // "v1" or small json
    });

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
    return await ctx.db
      .query("sessionSnapshots")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(limit ?? 12);
  },
});
