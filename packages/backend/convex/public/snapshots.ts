// packages/backend/convex/public/snapshots.ts
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

const MAX_SNAPSHOT_CHARS = 50_000; // V1: tiny payload only
const KEEP_LAST = 50;

// small tracking for pages list
const KEEP_PAGES = 25;

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

    // 1) Ensure session exists + belongs to org (anti cross-org writes)
    const session = await ctx.db.get(sessionId);
    if (!session) return { ok: false, error: "Session not found" };
    if (session.organizationId !== organizationId) {
      return { ok: false, error: "Forbidden" };
    }

    const now = Date.now();

    // 2) Presence + lightweight "visited pages" tracking in metadata (no schema change needed)
    const prevMeta = session.metadata ?? undefined;

    // build pages[]
    const prevPages = Array.isArray(prevMeta?.pages) ? prevMeta!.pages! : [];
    let nextPages = prevPages;

    if (pageUrl) {
      const last = prevPages[prevPages.length - 1];
      if (last !== pageUrl) {
        nextPages = [...prevPages, pageUrl].slice(-KEEP_PAGES);
      }
    }

    const nextViewportSize =
      typeof width === "number" && typeof height === "number" ? `${width}x${height}` : prevMeta?.viewportSize;

    const nextMeta = {
      ...(prevMeta ?? {}),
      // keep these aligned with what your UI expects
      currentUrl: pageUrl ?? prevMeta?.currentUrl,
      title: title ?? prevMeta?.title,
      viewportSize: nextViewportSize,
      pages: nextPages,

      // you already have both; keeping metadata.lastSeenAt updated helps UIs reading it
      lastSeenAt: now,
    };

    await ctx.db.patch(sessionId, {
      lastSeenAt: now,
      metadata: nextMeta,
    });

    // 3) Save snapshot row
    const id = await ctx.db.insert("sessionSnapshots", {
      organizationId,
      sessionId,
      ts: now,
      pageUrl,
      title,
      width,
      height,
      snapshot, // "v1" or small json
    });

    // 4) Keep only last N snapshots
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