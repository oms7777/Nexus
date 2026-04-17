// packages/backend/convex/public/contactSessions.ts
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { SESSION_DURATION_MS } from "../constants";
import { api } from "../_generated/api";

/** -------------------------------------------------------------
 * Metadata schema (STRICT) — MUST MATCH schema.ts
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
  utmSource: v.optional(v.string()),
  title: v.optional(v.string()),
  pages: v.optional(v.array(v.string())),

  // GEO
  ip: v.optional(v.string()),
  city: v.optional(v.string()),
  countryCode: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),

  visitorId: v.optional(v.string()),
  clientIp: v.optional(v.string()),

  // legacy visitor_choice in metadata (keep)
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
  utmSource?: string;
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
      consent: { given: true, ts: Date.now(), privacyUrl, version },
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

function mergePagesPreserveOrder(a: string[], b: string[], cap = 20) {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (u: string) => {
    if (!u) return;
    if (seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };

  for (const u of a) push(u);
  for (const u of b) push(u);

  if (out.length > cap) return out.slice(out.length - cap);
  return out;
}

function mergeMetadata(oldMd: Metadata, incoming?: Metadata) {
  if (!incoming) return { ...(oldMd ?? {}) };

  const merged: Metadata = { ...(oldMd ?? {}), ...incoming };

  const a = Array.isArray(oldMd?.pages) ? oldMd.pages : [];
  const b = Array.isArray(incoming.pages) ? incoming.pages : [];
  if (a.length || b.length) merged.pages = mergePagesPreserveOrder(a, b, 20);

  return merged;
}

async function ensureSessionStartedLogged(
  ctx: any,
  opts: {
    organizationId: string;
    contactSessionId: any;
    source:
      | "create"
      | "ensure_new"
      | "ensure_existing"
      | "touch"
      | "setCurrentUrl"
      | "ensure_external_existing"
      | "ensure_external_new";
  }
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
    // never break session
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

    const safeIncoming = isPlainObject(args.metadata)
      ? (args.metadata as Metadata)
      : undefined;

    const preferredRepUserId =
      safeIncoming?.preferredRepUserId && typeof safeIncoming.preferredRepUserId === "string"
        ? safeIncoming.preferredRepUserId
        : undefined;

    const id = await ctx.db.insert("contactSessions", {
      name: args.name,
      email: args.email,
      organizationId: args.organizationId,
      expiresAt,
      metadata: safeIncoming,
      preferredRepUserId,
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
 * ensure — tracker site-wide (reuse by sessionId if valid)
 * ----------------------------------------------------------- */
export const ensure = mutation({
  args: {
    organizationId: v.string(),
    sessionId: v.optional(v.id("contactSessions")),
    metadata: v.optional(MetadataSchema),
  },
  handler: async (ctx, { organizationId, sessionId, metadata }) => {
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    const safeIncoming = isPlainObject(metadata) ? (metadata as Metadata) : undefined;

    const incomingPreferred =
      safeIncoming?.preferredRepUserId && typeof safeIncoming.preferredRepUserId === "string"
        ? safeIncoming.preferredRepUserId
        : undefined;

    // 1) reuse existing by sessionId
    if (sessionId) {
      const cur = await ctx.db.get(sessionId);
      if (cur && cur.organizationId === organizationId) {
        const oldMd = (cur.metadata ?? {}) as Metadata;
        const newMd = mergeMetadata(oldMd, safeIncoming);

        await ctx.db.patch(sessionId, {
          expiresAt,
          metadata: newMd,
          preferredRepUserId: incomingPreferred ?? cur.preferredRepUserId,
        });

        await ensureSessionStartedLogged(ctx, {
          organizationId,
          contactSessionId: sessionId,
          source: "ensure_existing",
        });

        return sessionId;
      }
    }

    // 2) create new anonymous
    const id = await ctx.db.insert("contactSessions", {
      name: "Visitor",
      email: "",
      organizationId,
      expiresAt,
      metadata: safeIncoming,
      preferredRepUserId: incomingPreferred,
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

    const safeIncoming = isPlainObject(metadata) ? (metadata as Metadata) : undefined;

    const incomingPreferred =
      safeIncoming?.preferredRepUserId && typeof safeIncoming.preferredRepUserId === "string"
        ? safeIncoming.preferredRepUserId
        : undefined;

    const oldMd = (cur.metadata ?? {}) as Metadata;
    const newMd = mergeMetadata(oldMd, safeIncoming);

    await ctx.db.patch(sessionId, {
      expiresAt,
      metadata: newMd,
      preferredRepUserId: incomingPreferred ?? cur.preferredRepUserId,
    });

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

    const idx = pages.indexOf(url);
    if (idx >= 0) pages.splice(idx, 1);
    pages.push(url);

    const capped = pages.length > 20 ? pages.slice(pages.length - 20) : pages;

    await ctx.db.patch(sessionId, {
      metadata: {
        ...md,
        currentUrl: url,
        title: title ?? md.title,
        referrer: typeof referrer === "string" ? referrer : md.referrer,
        pages: capped,
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

/** -------------------------------------------------------------
 * ensureByExternalId — embed sends a stable string id
 * ----------------------------------------------------------- */
export const ensureByExternalId = mutation({
  args: {
    organizationId: v.string(),
    externalSessionId: v.string(),
    metadata: v.optional(MetadataSchema),
  },
  handler: async (ctx, { organizationId, externalSessionId, metadata }) => {
    const now = Date.now();
    const longExpiry = now + SESSION_DURATION_MS;
    /** Heartbeats set a short `expiresAt` (~90s). Do not overwrite with 48h on every ensure. */
    const HEARTBEAT_TTL_WINDOW_MS = 15 * 60 * 1000;

    const safeIncoming = isPlainObject(metadata) ? (metadata as Metadata) : undefined;

    const incomingPreferred =
      safeIncoming?.preferredRepUserId && typeof safeIncoming.preferredRepUserId === "string"
        ? safeIncoming.preferredRepUserId
        : undefined;

    const existingByExternal = await ctx.db
      .query("contactSessions")
      .withIndex("by_org_external_session", (q: any) =>
        q.eq("organizationId", organizationId).eq("externalSessionId", externalSessionId)
      )
      .order("desc")
      .first();

    if (existingByExternal) {
      const oldMd = (existingByExternal.metadata ?? {}) as Metadata;
      const newMd = mergeMetadata(oldMd, safeIncoming);

      const prevExp = existingByExternal.expiresAt ?? 0;
      const remaining = prevExp - now;
      const nextExpiresAt =
        remaining > 0 && remaining <= HEARTBEAT_TTL_WINDOW_MS ? prevExp : longExpiry;

      await ctx.db.patch(existingByExternal._id, {
        expiresAt: nextExpiresAt,
        metadata: newMd,
        externalSessionId,
        preferredRepUserId: incomingPreferred ?? existingByExternal.preferredRepUserId,
      });

      await ensureSessionStartedLogged(ctx, {
        organizationId,
        contactSessionId: existingByExternal._id,
        source: "ensure_external_existing",
      });

      return existingByExternal._id;
    }

    const id = await ctx.db.insert("contactSessions", {
      name: "Visitor",
      email: "",
      organizationId,
      externalSessionId,
      expiresAt: longExpiry,
      metadata: safeIncoming,
      preferredRepUserId: incomingPreferred,
    });

    await ensureSessionStartedLogged(ctx, {
      organizationId,
      contactSessionId: id,
      source: "ensure_external_new",
    });

    return id;
  },
});
