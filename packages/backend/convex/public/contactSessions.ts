import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { SESSION_DURATION_MS } from "../constants";

/**
 * Crée une session explicite (widget) — inchangé, on garde.
 */
export const create = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    organizationId: v.string(),
    metadata: v.optional(
      v.object({
        userAgent: v.optional(v.string()),
        language: v.optional(v.string()),
        languages: v.optional(v.string()),
        platform: v.optional(v.string()),
        vendor: v.optional(v.string()),
        screenResolution: v.optional(v.string()),
        viewportSize: v.optional(v.string()),
        timezone: v.optional(v.string()),
        timezoneOffset: v.optional(v.number()),
        cookieEnabled: v.optional(v.boolean()),
        referrer: v.optional(v.string()),
        currentUrl: v.optional(v.string()),
        title: v.optional(v.string()),
        pages: v.optional(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + SESSION_DURATION_MS;

    const id = await ctx.db.insert("contactSessions", {
      name: args.name,
      email: args.email,
      organizationId: args.organizationId,
      expiresAt,
      metadata: args.metadata,
    });

    return id;
  },
});

/**
 * ensure — utilisée par le tracker “site-wide”.
 * - Si sessionId valide ⇒ prolonge + merge metadata (pages dédoublonnées)
 * - Sinon ⇒ crée une session anonyme légère
 */
export const ensure = mutation({
  args: {
    organizationId: v.string(),
    sessionId: v.optional(v.id("contactSessions")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { organizationId, sessionId, metadata }) => {
    const now = Date.now();
    const expiresAt = now + SESSION_DURATION_MS;

    if (sessionId) {
      const cur = await ctx.db.get(sessionId);
      if (cur && cur.organizationId === organizationId) {
        const oldMd = (cur.metadata ?? {}) as Record<string, any>;
        const newMd: Record<string, any> = { ...oldMd, ...(metadata ?? {}) };

        // dédoublonne metadata.pages si présent
        const a = Array.isArray(oldMd.pages) ? oldMd.pages : [];
        const b = Array.isArray(metadata?.pages) ? metadata.pages : [];
        if (a.length || b.length) {
          newMd.pages = Array.from(new Set<string>([...a, ...b]));
        }

        await ctx.db.patch(sessionId, { expiresAt, metadata: newMd });
        return sessionId;
      }
    }

    const id = await ctx.db.insert("contactSessions", {
      name: "Visitor",   // défaut propre (au lieu de string vide)
      email: "",
      organizationId,
      expiresAt,
      metadata,
    });
    return id;
  },
});

/**
 * touch — heartbeat/“je suis encore là”.
 * - Prolonge l’expiration
 * - Merge optionnel de petites infos
 */
export const touch = mutation({
  args: {
    sessionId: v.id("contactSessions"),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { sessionId, metadata }) => {
    const cur = await ctx.db.get(sessionId);
    if (!cur) return { ok: false };
    const now = Date.now();
    const expiresAt = now + SESSION_DURATION_MS;

    if (metadata) {
      const oldMd = (cur.metadata ?? {}) as Record<string, any>;
      const newMd = { ...oldMd, ...metadata };
      await ctx.db.patch(sessionId, { expiresAt, metadata: newMd });
    } else {
      await ctx.db.patch(sessionId, { expiresAt });
    }
    return { ok: true };
  },
});

/**
 * setCurrentUrl — pour SPA nav + historisation simple
 * - met à jour currentUrl/title/referrer
 * - ajoute à metadata.pages si nouvelle page
 * - bump le TTL (utile quand l’utilisateur navigue)
 */
export const setCurrentUrl = mutation({
  args: {
    sessionId: v.id("contactSessions"),
    url: v.string(),
    title: v.optional(v.string()),
    referrer: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, url, title, referrer }) => {
    const cur = await ctx.db.get(sessionId);
    if (!cur) return { ok: false };

    const md = (cur.metadata ?? {}) as Record<string, any>;
    const pages = Array.isArray(md.pages) ? md.pages.slice() : [];
    if (pages[pages.length - 1] !== url) pages.push(url);

    await ctx.db.patch(sessionId, {
      metadata: {
        ...md,
        currentUrl: url,
        title: title ?? md.title,
        referrer: typeof referrer === "string" ? referrer : md.referrer,
        pages,
      },
      expiresAt: Date.now() + SESSION_DURATION_MS, // bump TTL
    });
    return { ok: true };
  },
});

/**
 * validate — fix (ctx au lieu de "convexToJson")
 */
export const validate = mutation({
  args: { contactSessionId: v.id("contactSessions") },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.contactSessionId);
    if (!s) return { valid: false, reason: "Contact session not found" };
    if (s.expiresAt < Date.now()) return { valid: false, reason: "Contact session expired" };
    return { valid: true, contactSession: s };
  },
});
