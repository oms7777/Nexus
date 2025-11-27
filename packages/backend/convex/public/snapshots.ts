// packages/backend/convex/public/snapshots.ts
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Sauvegarde un snapshot rrweb d'une session.
 * Ici on stocke directement les events JSON dans le champ `snapshot`.
 */
export const save = mutation({
  args: {
    organizationId: v.string(),
    sessionId: v.id("contactSessions"),
    events: v.array(v.any()), // rrweb events
  },
  handler: async (ctx, { organizationId, sessionId, events }) => {
    if (!events.length) {
      return { ok: false, reason: "no_events" };
    }

    // 1) ne pas recréer si un snapshot existe déjà pour cette session
    const existing = await ctx.db
      .query("sessionSnapshots")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("asc")
      .first();

    if (existing) {
      return { ok: true, reused: true, id: existing._id };
    }

    // 2) extraire quelques infos utiles depuis un event rrweb (href, title, width, height)
    let pageUrl: string | undefined;
    let title: string | undefined;
    let width: number | undefined;
    let height: number | undefined;

    const metaEvent: any =
      events.find((ev: any) => ev?.type === 4 || ev?.type === 2) ?? null;

    if (metaEvent?.data) {
      const d = metaEvent.data;
      if (typeof d.href === "string") pageUrl = d.href;
      if (typeof d.title === "string") title = d.title;
      if (typeof d.width === "number") width = d.width;
      if (typeof d.height === "number") height = d.height;
    }

    // 3) insérer la ligne dans sessionSnapshots
    const id = await ctx.db.insert("sessionSnapshots", {
      organizationId,
      sessionId,
      ts: Date.now(),
      pageUrl,
      title,
      width,
      height,
      snapshot: events, // ✅ on garde les events bruts
    });

    return { ok: true, id };
  },
});

/**
 * Lister les snapshots récents d'une session
 */
export const listRecent = query({
  args: {
    sessionId: v.id("contactSessions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, limit }) => {
    const rows = await ctx.db
      .query("sessionSnapshots")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(limit ?? 12);

    // ici pas de storage, on renvoie juste les lignes
    return rows;
  },
});
