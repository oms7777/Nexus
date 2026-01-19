// packages/backend/convex/public/contactSessions.ts
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { SESSION_DURATION_MS } from "../constants";
import { api } from "../_generated/api";

/** -------------------------------------------------------------
 * Metadata schema (STRICT)
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

  // GEO
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

function mergeMetadata(oldMd: Metadata, incoming?: Metadata) {
  if (!incoming) return { ...(oldMd ?? {}) };

  const merged: Metadata = { ...(oldMd ?? {}), ...incoming };

  // pages: de-dupe
  const a = Array.isArray(oldMd?.pages) ? oldMd.pages : [];
  const b = Array.isArray(incoming.pages) ? incoming.pages : [];
  if (a.length || b.length) {
    merged.pages = Array.from(new Set<string>([...a, ...b]));
  }

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
      | "setCurrentUrl";
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
    // never break session
  }
}

function pickVisitorId(metadata?: Metadata) {
  const vId = metadata?.visitorId;
  if (typeof vId !== "string") return undefined;
  const trimmed = vId.trim();
  return trimmed.length ? trimmed : undefined;
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

    const visitorId = pickVisitorId(safeIncoming);

    const id = await ctx.db.insert("contactSessions", {
      name: args.name,
      email: args.email,
      organizationId: args.organizationId,
      expiresAt,
      metadata: safeIncoming,
      visitorId, // ✅ top-level (dedupe)
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
 * ensure — tracker site-wide (DEDUP by visitorId)
 * ----------------------------------------------------------- */
export const ensure = mutation({
  args: {
    organizationId: v.string(),
    sessionId: v.optional(v.id("contactSessions")),
    metadata: v.optional(MetadataSchema),
  },
  handler: async (ctx, { organizationId, sessionId, metadata }) => {
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    const safeIncoming = isPlainObject(metadata)
      ? (metadata as Metadata)
      : undefined;

    const visitorId = pickVisitorId(safeIncoming);

    // ✅ 1) Prefer: reuse by visitorId (prevents stacking on refresh/reopen)
    if (visitorId) {
      const existingByVisitor = await ctx.db
        .query("contactSessions")
        .withIndex("by_org_visitor_id", (q: any) =>
          q.eq("organizationId", organizationId).eq("visitorId", visitorId),
        )
        .order("desc")
        .first();

      if (existingByVisitor) {
        const oldMd = (existingByVisitor.metadata ?? {}) as Metadata;
        const newMd = mergeMetadata(oldMd, safeIncoming);

        await ctx.db.patch(existingByVisitor._id, {
          expiresAt,
          metadata: newMd,
          visitorId, // keep consistent
        });

        await ensureSessionStartedLogged(ctx, {
          organizationId,
          contactSessionId: existingByVisitor._id,
          source: "ensure_existing",
        });

        return existingByVisitor._id;
      }
    }

    // ✅ 2) Fallback: reuse by sessionId
    if (sessionId) {
      const cur = await ctx.db.get(sessionId);
      if (cur && cur.organizationId === organizationId) {
        const oldMd = (cur.metadata ?? {}) as Metadata;
        const newMd = mergeMetadata(oldMd, safeIncoming);

        await ctx.db.patch(sessionId, {
          expiresAt,
          metadata: newMd,
          visitorId: visitorId ?? cur.visitorId, // store if we have it
        });

        await ensureSessionStartedLogged(ctx, {
          organizationId,
          contactSessionId: sessionId,
          source: "ensure_existing",
        });

        return sessionId;
      }
    }

    // ✅ 3) Create new anonymous
    const id = await ctx.db.insert("contactSessions", {
      name: "Visitor",
      email: "",
      organizationId,
      expiresAt,
      metadata: safeIncoming,
      visitorId, // ✅
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

    const safeIncoming = isPlainObject(metadata)
      ? (metadata as Metadata)
      : undefined;

    const visitorId = pickVisitorId(safeIncoming);

    if (safeIncoming) {
      const oldMd = (cur.metadata ?? {}) as Metadata;
      const newMd = mergeMetadata(oldMd, safeIncoming);

      await ctx.db.patch(sessionId, {
        expiresAt,
        metadata: newMd,
        visitorId: visitorId ?? cur.visitorId,
      });
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
      // keep visitorId top-level if already set
      visitorId: cur.visitorId,
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
    if (s.expiresAt < Date.now())
      return { valid: false, reason: "Contact session expired" };
    return { valid: true, contactSession: s };
  },
});

/** -------------------------------------------------------------
 * ensureByExternalId — embed sends a string session id
 * ----------------------------------------------------------- */
export const ensureByExternalId = mutation({
  args: {
    organizationId: v.string(),
    externalSessionId: v.string(),
    metadata: v.optional(MetadataSchema),
  },
  handler: async (ctx, { organizationId, externalSessionId, metadata }) => {
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    const safeIncoming = isPlainObject(metadata)
      ? (metadata as Metadata)
      : undefined;

    const visitorId = pickVisitorId(safeIncoming);

    const existing = await ctx.db
      .query("contactSessions")
      .withIndex("by_org_external_session", (q: any) =>
        q
          .eq("organizationId", organizationId)
          .eq("externalSessionId", externalSessionId),
      )
      .first();

    if (existing) {
      const oldMd = (existing.metadata ?? {}) as Metadata;
      const newMd = mergeMetadata(oldMd, safeIncoming);

      await ctx.db.patch(existing._id, {
        expiresAt,
        metadata: newMd,
        visitorId: visitorId ?? existing.visitorId,
      });

      await ensureSessionStartedLogged(ctx, {
        organizationId,
        contactSessionId: existing._id,
        source: "ensure_existing",
      });

      return existing._id;
    }

    const id = await ctx.db.insert("contactSessions", {
      name: "Visitor",
      email: "",
      organizationId,
      externalSessionId,
      expiresAt,
      metadata: safeIncoming,
      visitorId,
    });

    await ensureSessionStartedLogged(ctx, {
      organizationId,
      contactSessionId: id,
      source: "ensure_new",
    });

    return id;
  },
});
