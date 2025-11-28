// packages/backend/convex/public/snapshots.ts
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

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

    if (!snapshot) {
      return { ok: false };
    }

    const id = await ctx.db.insert("sessionSnapshots", {
      organizationId,
      sessionId,
      ts: Date.now(),
      pageUrl,
      title,
      width,
      height,
      snapshot, // ✅ stocké directement en base
    });

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
