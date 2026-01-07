// packages/backend/convex/public/contactSessions.ts
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { SESSION_DURATION_MS } from "../constants";
import { api } from "../_generated/api";

/** -------------------------------------------------------------
 * Metadata schema (STRICT) — doit matcher EXACTEMENT le schema Convex
 * (sinon Convex crash au patch/insert)
 * ----------------------------------------------------------- */
const MetadataSchema = v.object({
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

  // GEO (dans ton schema)
  ip: v.optional(v.string()),
  city: v.optional(v.string()),
  countryCode: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),

  // tracking
  visitorId: v.optional(v.string()),
  clientIp: v.optional(v.string()),

  // visitor_choice
  preferredRepUserId: v.optional(v.string()),
});

type Metadata = {
  userAgent?: string;
  language?: string;
  languages?: string;
  platform?: string;
  vendor?: string;
  screenResolution?: string;
  viewportSize?: string;
  timezone?: string;
  timezoneOffset?: number;
  cookieEnabled?: boolean;
  referrer?: string;
  currentUrl?: string;
  title?: string;
  pages?: string[];

  ip?: string;
  city?: string;
  countryCode?: string;
  lat?: number;
  lng?: number;

  visitorId?: string;
  clientIp?: string;

  preferredRepUserId?: string;
};

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
function isPlainObject(x: unknown): x is Record<string, any> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function mergeMetadata(oldMd: Metadata, incoming?: Metadata) {
  if (!incoming) return { ...(oldMd ?? {}) };

  const merged: Metadata = { ...(oldMd ?? {}), ...incoming };

  // pages: dédoublonnage si présent
  const a = Array.isArray(oldMd?.pages) ? oldMd.pages : [];
  const b = Array.isArray(incoming.pages) ? incoming.pages : [];
  if (a.length || b.length) {
    merged.pages = Array.from(new Set<string>([...a, ...b]));
  }

  return merged;
}

/**
 * Log "session_started" UNE SEULE FOIS par session (sans écrire de flag dans metadata).
 * Idempotence => check analyticsEvents(type=session_started, sessionId=...)
 */
async function ensureSessionStartedLogged(
  ctx: any,
  opts: {
    organizationId: string;
    contactSessionId: any; // Id<"contactSessions">
    source: "create" | "ensure_new" | "ensure_existing" | "touch" | "setCurrentUrl";
  },
) {
  const existing = await ctx.db
    .query("analyticsEvents")
    .withIndex("by_session", (q: any) => q.eq("sessionId", opts.contactSessionId))
    .filter((q: any) => q.eq(q.field("type"), "session_started"))
    .first();

  if (existing) return;

  try {
    await ctx.runMutation(api.public.analytics.log, {
      organizationId: opts.organizationId,
      type: "session_started",
      sessionId: opts.contactSessionId,
      meta: { source: opts.source },
    });
  } catch {
    // analytics ne doit jamais casser la session
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
    metadata: v.optional(MetadataSchema),
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

    await ensureSessionStartedLogged(ctx, {
      organizationId: args.organizationId,
      contactSessionId: id,
      source: "create",
    });

    return id;
  },
});

/** -------------------------------------------------------------
 * ensure — tracker site-wide (SAFE + STRICT)
 * ----------------------------------------------------------- */
export const ensure = mutation({
  args: {
    organizationId: v.string(),
    sessionId: v.optional(v.id("contactSessions")),
    metadata: v.optional(MetadataSchema),
  },
  handler: async (ctx, { organizationId, sessionId, metadata }) => {
    const now = Date.now();
    const expiresAt = now + SESSION_DURATION_MS;

    // reuse existing
    if (sessionId) {
      const cur = await ctx.db.get(sessionId);
      if (cur && cur.organizationId === organizationId) {
        const oldMd = (cur.metadata ?? {}) as Metadata;

        // ✅ extra safety: if metadata somehow isn't an object, ignore it
        const safeIncoming = isPlainObject(metadata) ? (metadata as Metadata) : undefined;

        const newMd = mergeMetadata(oldMd, safeIncoming);

        await ctx.db.patch(sessionId, { expiresAt, metadata: newMd });

        await ensureSessionStartedLogged(ctx, {
          organizationId,
          contactSessionId: sessionId,
          source: "ensure_existing",
        });

        return sessionId;
      }
    }

    // create new anonymous
    const id = await ctx.db.insert("contactSessions", {
      name: "Visitor",
      email: "",
      organizationId,
      expiresAt,
      metadata,
    });

    await ensureSessionStartedLogged(ctx, {
      organizationId,
      contactSessionId: id,
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
    metadata: v.optional(MetadataSchema),
  },
  handler: async (ctx, { sessionId, metadata }) => {
    const cur = await ctx.db.get(sessionId);
    if (!cur) return { ok: false };

    const expiresAt = Date.now() + SESSION_DURATION_MS;

    if (metadata) {
      const oldMd = (cur.metadata ?? {}) as Metadata;
      const safeIncoming = isPlainObject(metadata) ? (metadata as Metadata) : undefined;
      const newMd = mergeMetadata(oldMd, safeIncoming);
      await ctx.db.patch(sessionId, { expiresAt, metadata: newMd });
    } else {
      await ctx.db.patch(sessionId, { expiresAt });
    }

    await ensureSessionStartedLogged(ctx, {
      organizationId: cur.organizationId,
      contactSessionId: sessionId,
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

    const md = (cur.metadata ?? {}) as Metadata;
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

    await ensureSessionStartedLogged(ctx, {
      organizationId: cur.organizationId,
      contactSessionId: sessionId,
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
    if (s.expiresAt < Date.now()) return { valid: false, reason: "Contact session expired" };
    return { valid: true, contactSession: s };
  },
});
