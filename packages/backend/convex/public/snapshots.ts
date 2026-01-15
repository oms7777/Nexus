import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

// Guard simple (Convex runtime: éviter TextEncoder)
const MAX_SNAPSHOT_CHARS = 2_000_000; // ~2MB-ish worst case (ajuste si besoin)
const KEEP_LAST = 25;

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

    // ✅ guard simple (pas de TextEncoder ici)
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
    return await ctx.db
      .query("sessionSnapshots")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(limit ?? 12);
  },
});
