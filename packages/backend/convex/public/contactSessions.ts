// convex/public/contactSessions.ts
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { SESSION_DURATION_MS } from "../constants";
import { api } from "../_generated/api";

/**
 * Petit flag interne dans metadata pour éviter de logger session_started 10x.
 * On le garde dans metadata pour ne pas toucher au schema.
 */
const SESSION_STARTED_FLAG = "__analytics_session_started_logged";

/** -------------------------------------------------------------
 * Consent
 * ----------------------------------------------------------- */
export const grantConsent = mutation({
  args: {
    contactSessionId: v.id("contactSessions"),
    privacyUrl: v.optional(v.string()),
    version: v.optional(v.string()),
  },
  handler: async (ctx, { contactSessionId, privacyUrl, version }) => {
    const session = await ctx.db.get(contactSessionId);
    if (!session) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Session not found" });
    }

    await ctx.db.patch(contactSessionId, {
      consent: {
        given: true,
        ts: Date.now(),
        privacyUrl,
        version,
      },
    });

    return { ok: true };
  },
});

/** -------------------------------------------------------------
 * Helpers
 * ----------------------------------------------------------- */
function mergeMetadata(oldMd: Record<string, any>, incoming: any) {
  const newMd: Record<string, any> = { ...oldMd, ...(incoming ?? {}) };

  // pages: dédoublonnage si présent
  const a = Array.isArray(oldMd.pages) ? oldMd.pages : [];
  const b = Array.isArray(incoming?.pages) ? incoming.pages : [];
  if (a.length || b.length) {
    newMd.pages = Array.from(new Set<string>([...a, ...b]));
  }

  return newMd;
}

/**
 * Log "session_started" UNE SEULE FOIS par session.
 * - Si déjà loggé (flag metadata), on ne fait rien.
 * - Sinon: on patch la session metadata + on log l'event.
 */
async function ensureSessionStartedLogged(ctx: any, opts: {
  organizationId: string;
  contactSessionId: any; // Id<"contactSessions">
  metadata?: Record<string, any>;
  source: "create" | "ensure_new" | "ensure_existing" | "touch" | "setCurrentUrl";
}) {
  const s = await ctx.db.get(opts.contactSessionId);
  if (!s) return;

  const md = (s.metadata ?? {}) as Record<string, any>;
  const already = md?.[SESSION_STARTED_FLAG] === true;

  if (already) return;

  // 1) patch flag
  await ctx.db.patch(opts.contactSessionId, {
    metadata: {
      ...md,
      [SESSION_STARTED_FLAG]: true,
    },
  });

  // 2) log analytics (non bloquant)
  try {
    await ctx.runMutation(api.public.analytics.log, {
      organizationId: opts.organizationId,
      type: "session_started",
      sessionId: opts.contactSessionId,
      meta: {
        source: opts.source,
        // tu peux enrichir si tu veux, mais ton analytics.log enrichit déjà
        // via sessionId (countryCode/city/currentUrl/utm/etc)
      },
    });
  } catch {
    // no-op: analytics doit jamais casser la session
  }
}

/** -------------------------------------------------------------
 * create — session explicite (widget)
 * ----------------------------------------------------------- */
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
      }),
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

    // ✅ log session_started 1x
    await ensureSessionStartedLogged(ctx, {
      organizationId: args.organizationId,
      contactSessionId: id,
      metadata: args.metadata as any,
      source: "create",
    });

    return id;
  },
});

/** -------------------------------------------------------------
 * ensure — tracker site-wide
 * - si sessionId valide ⇒ prolonge + merge metadata
 * - sinon ⇒ crée session anonyme
 * ----------------------------------------------------------- */
export const ensure = mutation({
  args: {
    organizationId: v.string(),
    sessionId: v.optional(v.id("contactSessions")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { organizationId, sessionId, metadata }) => {
    const now = Date.now();
    const expiresAt = now + SESSION_DURATION_MS;

    // --- case: reuse existing session
    if (sessionId) {
      const cur = await ctx.db.get(sessionId);
      if (cur && cur.organizationId === organizationId) {
        const oldMd = (cur.metadata ?? {}) as Record<string, any>;
        const newMd = mergeMetadata(oldMd, metadata);

        await ctx.db.patch(sessionId, { expiresAt, metadata: newMd });

        // ✅ si pas encore loggé, on log ici (1 seule fois)
        await ensureSessionStartedLogged(ctx, {
          organizationId,
          contactSessionId: sessionId,
          metadata: newMd,
          source: "ensure_existing",
        });

        return sessionId;
      }
    }

    // --- case: create new anonymous session
    const id = await ctx.db.insert("contactSessions", {
      name: "Visitor",
      email: "",
      organizationId,
      expiresAt,
      metadata,
    });

    // ✅ log session_started 1x
    await ensureSessionStartedLogged(ctx, {
      organizationId,
      contactSessionId: id,
      metadata: (metadata ?? {}) as Record<string, any>,
      source: "ensure_new",
    });

    return id;
  },
});

/** -------------------------------------------------------------
 * touch — heartbeat / TTL bump
 * ----------------------------------------------------------- */
export const touch = mutation({
  args: {
    sessionId: v.id("contactSessions"),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { sessionId, metadata }) => {
    const cur = await ctx.db.get(sessionId);
    if (!cur) return { ok: false };

    const expiresAt = Date.now() + SESSION_DURATION_MS;

    if (metadata) {
      const oldMd = (cur.metadata ?? {}) as Record<string, any>;
      const newMd = mergeMetadata(oldMd, metadata);
      await ctx.db.patch(sessionId, { expiresAt, metadata: newMd });
    } else {
      await ctx.db.patch(sessionId, { expiresAt });
    }

    // (optionnel) on ne log pas session_started ici,
    // ensure/create suffit. Mais on peut sécuriser:
    await ensureSessionStartedLogged(ctx, {
      organizationId: cur.organizationId,
      contactSessionId: sessionId,
      metadata: (cur.metadata ?? {}) as Record<string, any>,
      source: "touch",
    });

    return { ok: true };
  },
});

/** -------------------------------------------------------------
 * setCurrentUrl — SPA nav + pages history
 * ----------------------------------------------------------- */
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
      expiresAt: Date.now() + SESSION_DURATION_MS,
    });

    // ✅ sécurité: si session_started jamais loggé, on le log ici (1x)
    await ensureSessionStartedLogged(ctx, {
      organizationId: cur.organizationId,
      contactSessionId: sessionId,
      metadata: (cur.metadata ?? {}) as Record<string, any>,
      source: "setCurrentUrl",
    });

    return { ok: true };
  },
});

/** -------------------------------------------------------------
 * validate
 * ----------------------------------------------------------- */
export const validate = mutation({
  args: { contactSessionId: v.id("contactSessions") },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.contactSessionId);
    if (!s) return { valid: false, reason: "Contact session not found" };
    if (s.expiresAt < Date.now())
      return { valid: false, reason: "Contact session expired" };
    return { valid: true, contactSession: s };
  },
});
