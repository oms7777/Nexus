// packages/backend/convex/live.ts
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeVisitorUrlKey } from "./lib/visitorUrls";
import { SESSION_DURATION_MS } from "./constants";

/** Helpers */
function isPrivateOrLoopback(ip: string) {
  if (ip === "::1") return true;
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("172.")) {
    const second = Number(ip.split(".")[1] ?? "0");
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function normCC(cc?: string) {
  const s = (cc || "").trim().toUpperCase();
  return s.length ? s : undefined;
}

/** TTL du cache IP (24h) */
const GEO_TTL_MS = 24 * 60 * 60 * 1000;
/** Visiteur "actif" pendant ~90s après le dernier heartbeat */
const SESSION_TTL_MS = 90 * 1000;

export interface GeoResult {
  city?: string;
  countryCode?: string;
  lat?: number;
  lng?: number;
  /** Employer inferred from a corporate IP range. Absent on residential / datacenter IPs. */
  companyName?: string;
  companyDomain?: string;
  /** ipdata network class: business | education | government | isp | hosting. */
  connectionType?: string;
}

/**
 * Network classes where the IP owner is plausibly the visitor's employer.
 * Residential ISPs resolve to "Orange", "Free"… and datacenters to cloud providers,
 * so surfacing those as company names would be misleading in the dashboard.
 */
const CORPORATE_CONNECTION_TYPES = new Set(["business", "education", "government"]);

function normalizeOrgIdentity(input: {
  name?: string | null;
  domain?: string | null;
  type?: string | null;
}): Pick<GeoResult, "companyName" | "companyDomain" | "connectionType"> {
  const connectionType = (input.type ?? "").trim().toLowerCase() || undefined;

  if (!connectionType || !CORPORATE_CONNECTION_TYPES.has(connectionType)) {
    return { connectionType };
  }

  return {
    companyName: (input.name ?? "").trim() || undefined,
    companyDomain: (input.domain ?? "").trim().toLowerCase() || undefined,
    connectionType,
  };
}

/** Cache lookup */
export const getCached = internalQuery({
  args: { ip: v.string() },
  handler: async (ctx, { ip }) => {
    const now = Date.now();
    const row = await ctx.db.query("ipGeoCache").withIndex("by_ip", (q) => q.eq("ip", ip)).unique();
    if (!row) return null;
    if (row.expiresAt < now) return null;
    return row;
  },
});

export const setCached = internalMutation({
  args: {
    ip: v.string(),
    city: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    companyName: v.optional(v.string()),
    companyDomain: v.optional(v.string()),
    connectionType: v.optional(v.string()),
    ttlMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const expiresAt = Date.now() + (args.ttlMs ?? GEO_TTL_MS);
    const existing = await ctx.db.query("ipGeoCache").withIndex("by_ip", (q) => q.eq("ip", args.ip)).unique();

    const doc = {
      ip: args.ip,
      city: args.city,
      countryCode: args.countryCode,
      lat: args.lat,
      lng: args.lng,
      companyName: args.companyName,
      companyDomain: args.companyDomain,
      connectionType: args.connectionType,
      expiresAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }
    return ctx.db.insert("ipGeoCache", doc);
  },
});

async function geoFromIpdata(ip: string): Promise<GeoResult | null> {
  const key = process.env.IPDATA_API_KEY?.trim();
  if (!key) return null;

  const url = `https://api.ipdata.co/${encodeURIComponent(ip)}?api-key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ipdata http ${res.status}`);
  const data = (await res.json()) as {
    city?: string;
    country_code?: string;
    latitude?: number;
    longitude?: number;
    asn?: { name?: string; domain?: string; type?: string };
    company?: { name?: string; domain?: string; type?: string };
  };

  const city = data.city ?? undefined;
  const countryCode = data.country_code ?? undefined;
  const lat = typeof data.latitude === "number" ? data.latitude : undefined;
  const lng = typeof data.longitude === "number" ? data.longitude : undefined;

  // `company` is more precise than `asn` when the plan returns it; fall back to `asn`.
  const identity = normalizeOrgIdentity({
    name: data.company?.name ?? data.asn?.name,
    domain: data.company?.domain ?? data.asn?.domain,
    type: data.company?.type ?? data.asn?.type,
  });

  return { city, countryCode, lat, lng, ...identity };
}

/**
 * HTTPS fallback when ipdata is not configured or errors.
 * Prefer setting IPDATA_API_KEY in production (SLA / limits).
 */
function safeTrimRef(x?: string): string | undefined {
  const s = typeof x === "string" ? x.trim() : "";
  return s.length ? s : undefined;
}

async function geoFromIpWhoFallback(ip: string): Promise<GeoResult | null> {
  const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
  if (!res.ok) throw new Error(`ipwho http ${res.status}`);
  const data = (await res.json()) as {
    success?: boolean;
    city?: string;
    country_code?: string;
    latitude?: number;
    longitude?: number;
  };
  if (data.success === false) return null;

  const city = data.city ?? undefined;
  const countryCode =
    typeof data.country_code === "string" ? data.country_code.toUpperCase() : undefined;
  const lat = typeof data.latitude === "number" ? data.latitude : undefined;
  const lng = typeof data.longitude === "number" ? data.longitude : undefined;
  return { city, countryCode, lat, lng };
}

/** Third fallback (HTTP, server-side only) when ipdata + ipwho fail. */
async function geoFromIpApiFallback(ip: string): Promise<GeoResult | null> {
  const res = await fetch(
    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,city,lat,lon`,
  );
  if (!res.ok) throw new Error(`ip-api http ${res.status}`);
  const data = (await res.json()) as {
    status?: string;
    countryCode?: string;
    city?: string;
    lat?: number;
    lon?: number;
  };
  if (data.status !== "success") return null;
  const city = data.city ?? undefined;
  const countryCode =
    typeof data.countryCode === "string" ? data.countryCode.toUpperCase() : undefined;
  const lat = typeof data.lat === "number" ? data.lat : undefined;
  const lng = typeof data.lon === "number" ? data.lon : undefined;
  return { city, countryCode, lat, lng };
}

function mergeGeo(a: GeoResult, b: GeoResult | null | undefined): GeoResult {
  if (!b) return a;
  return {
    city: b.city ?? a.city,
    countryCode: b.countryCode ?? a.countryCode,
    lat: b.lat ?? a.lat,
    lng: b.lng ?? a.lng,
    // Only ipdata classifies networks, so the geo fallbacks never overwrite identity.
    companyName: b.companyName ?? a.companyName,
    companyDomain: b.companyDomain ?? a.companyDomain,
    connectionType: b.connectionType ?? a.connectionType,
  };
}

/** Lookup IP (ipdata preferred, ipwho.is fallback) + cache */
export const lookupIp = internalAction({
  args: { ip: v.string() },
  handler: async (ctx, { ip }): Promise<GeoResult> => {
    const cached = await ctx.runQuery(internal.live.getCached, { ip });
    // Old cache rows could have city/country but no coords — re-fetch to populate map pins.
    // Rows cached before network identity shipped simply pick it up when their TTL expires.
    if (cached && cached.lat != null && cached.lng != null) {
      return {
        city: cached.city,
        countryCode: cached.countryCode,
        lat: cached.lat,
        lng: cached.lng,
        companyName: cached.companyName,
        companyDomain: cached.companyDomain,
        connectionType: cached.connectionType,
      };
    }

    let merged: GeoResult = {
      city: cached?.city,
      countryCode: cached?.countryCode,
      lat: cached?.lat,
      lng: cached?.lng,
      companyName: cached?.companyName,
      companyDomain: cached?.companyDomain,
      connectionType: cached?.connectionType,
    };

    try {
      merged = mergeGeo(merged, await geoFromIpdata(ip));
    } catch {
      // next
    }

    if (merged.lat == null || merged.lng == null) {
      try {
        merged = mergeGeo(merged, await geoFromIpWhoFallback(ip));
      } catch {
        // next
      }
    }

    if (merged.lat == null || merged.lng == null) {
      try {
        merged = mergeGeo(merged, await geoFromIpApiFallback(ip));
      } catch {
        // next
      }
    }

    if (!merged.countryCode && !merged.city && merged.lat == null && merged.lng == null) {
      return { city: undefined, countryCode: undefined, lat: undefined, lng: undefined };
    }

    const { city, countryCode, lat, lng, companyName, companyDomain, connectionType } = merged;
    await ctx.runMutation(internal.live.setCached, {
      ip,
      city,
      countryCode,
      lat,
      lng,
      companyName,
      companyDomain,
      connectionType,
    });
    return { city, countryCode, lat, lng, companyName, companyDomain, connectionType };
  },
});

/** -------------------------------------------------------------
 * Territory routing helpers
 * ----------------------------------------------------------- */
async function resolveTerritoryKey(ctx: any, organizationId: string, countryCode?: string) {
  const cc = normCC(countryCode);
  if (!cc) return undefined;

  const territories = await ctx.db
    .query("territories")
    .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
    .collect();

  const match = territories.find((t: any) =>
    Array.isArray(t.countryCodes)
      ? t.countryCodes.map((x: string) => String(x).toUpperCase()).includes(cc)
      : false
  );

  return match?.key as string | undefined;
}

/**
 * Pick an online rep for a given territory.
 * Important: repPresence.userId MUST match users.externalId (clerk subject).
 */
async function pickRepForTerritory(ctx: any, organizationId: string, territoryKey?: string) {
  const reps = await ctx.db
    .query("repsPresence")
    .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
    .collect();

  const online = reps.filter((r: any) => r.available === true);
  if (!online.length) return undefined;

  if (territoryKey) {
    const matches = online.filter((r: any) => {
      const regions = Array.isArray(r.regions) ? (r.regions as string[]) : [];
      return regions.includes(territoryKey);
    });

    if (matches.length) return matches[0].userId as string;
  }

  return online[0].userId as string;
}

/**
 * Whether an already-assigned rep may keep the session.
 * Heartbeats fire every 60s, so re-picking a rep on every beat makes leads hop
 * between equally valid reps on the Live map and can contradict the assignment
 * `routing.ensureAssignmentForSession` pinned for an ongoing conversation.
 */
async function repStillEligibleForTerritory(
  ctx: any,
  organizationId: string,
  userId: string,
  territoryKey?: string,
): Promise<boolean> {
  const reps = await ctx.db
    .query("repsPresence")
    .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
    .collect();

  const current = reps.find((r: any) => r.userId === userId);
  if (!current || current.available !== true) return false;
  if (!territoryKey) return true;

  const covers = (r: any) =>
    Array.isArray(r.regions) && (r.regions as string[]).includes(territoryKey);

  if (covers(current)) return true;

  // Nobody online covers this territory, so the current rep stays a valid fallback
  // (same rule `pickRepForTerritory` applies when it falls back to any online rep).
  return !reps.some((r: any) => r.available === true && covers(r));
}

/** Upsert heartbeat + enrich metadata + bump session TTL + territory assign (STICKY while valid) */
export const upsertHeartbeat = internalMutation({
  args: {
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
    currentUrl: v.optional(v.string()),
    referrer: v.optional(v.string()),
    language: v.optional(v.string()),
    timezone: v.optional(v.string()),
    viewportSize: v.optional(v.string()),
    screenResolution: v.optional(v.string()),
    ip: v.optional(v.string()),
    city: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    companyName: v.optional(v.string()),
    companyDomain: v.optional(v.string()),
    connectionType: v.optional(v.string()),
    title: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    cookieEnabled: v.optional(v.boolean()),
    timezoneOffset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.contactSessionId);
    if (!session || session.organizationId !== args.organizationId) return;

    const now = Date.now();
    const prevMetadata = session.metadata ?? {};
    /** Non-empty referrer from this heartbeat only (never treat "" as a real update). */
    const incomingReferrer = safeTrimRef(args.referrer);

    // ✅ Do NOT shrink the long-lived contact session expiry to the live TTL.
    // Keep session validity sliding (7d) while using `metadata.lastHeartbeatAt` for "Live" presence.
    const minimalUpdate: Record<string, any> = {
      expiresAt: Math.max(Number(session.expiresAt ?? 0), now + SESSION_DURATION_MS),
    };

    const isHostedIframeUrl = (url?: string): boolean => {
      if (!url) return false;
      try {
        const h = new URL(url).hostname;
        return h === "widget.inboundless.co" || h === "app.inboundless.co";
      } catch {
        return false;
      }
    };

    // Prefer real page URL; if HTTP layer stripped widget but referrer is still the host site, merge here too.
    let effectiveCurrentUrl = args.currentUrl;
    if (!effectiveCurrentUrl && args.referrer && !isHostedIframeUrl(args.referrer)) {
      effectiveCurrentUrl = args.referrer;
    }

    // --- metadata update (pages history) ---
    const prevUrlKey = normalizeVisitorUrlKey(prevMetadata.currentUrl as string | undefined);
    const nextUrlKey = normalizeVisitorUrlKey(effectiveCurrentUrl);
    const urlChanged =
      !!effectiveCurrentUrl && !!nextUrlKey && nextUrlKey !== prevUrlKey;
    const geoDataAvailable = args.city || args.countryCode || args.lat || args.lng;

    /** Persist attribution even on “quiet” heartbeats (fixes missing first-touch when geo is delayed). */
    if (urlChanged || geoDataAvailable || incomingReferrer) {
      const prevPages: string[] = Array.isArray(prevMetadata.pages) ? (prevMetadata.pages as string[]) : [];

      const addPage = (pages: string[], url?: string) => {
        if (!url || url.length <= 3) return pages;
        const k = normalizeVisitorUrlKey(url);
        if (!k) return pages;
        const head = pages[0];
        if (head && normalizeVisitorUrlKey(head) === k) return pages;
        return [url, ...pages];
      };

      const updatedPages = urlChanged
        ? addPage(prevPages, effectiveCurrentUrl).slice(0, 10)
        : prevPages;

      // Persist first-touch UTM params when we see them (so attribution survives navigation).
      // We only set them if missing to avoid overwriting original attribution.
      let utmFromUrl: Record<string, string> = {};
      if (effectiveCurrentUrl) {
        try {
          const u = new URL(effectiveCurrentUrl);
          const p = u.searchParams;
          const utm_source = p.get("utm_source") || undefined;
          const utm_medium = p.get("utm_medium") || undefined;
          const utm_campaign = p.get("utm_campaign") || undefined;
          const utm_term = p.get("utm_term") || undefined;
          const utm_content = p.get("utm_content") || undefined;
          if (utm_source) utmFromUrl.utm_source = utm_source;
          if (utm_medium) utmFromUrl.utm_medium = utm_medium;
          if (utm_campaign) utmFromUrl.utm_campaign = utm_campaign;
          if (utm_term) utmFromUrl.utm_term = utm_term;
          if (utm_content) utmFromUrl.utm_content = utm_content;
        } catch {
          // ignore
        }
      }

      minimalUpdate.metadata = {
        ...prevMetadata,
        language: args.language ?? prevMetadata.language,
        screenResolution: args.screenResolution ?? prevMetadata.screenResolution,
        viewportSize: args.viewportSize ?? prevMetadata.viewportSize,
        timezone: args.timezone ?? prevMetadata.timezone,
        referrer: incomingReferrer ?? safeTrimRef(prevMetadata.referrer as string | undefined),
        firstTouchReferrer:
          safeTrimRef((prevMetadata as any).firstTouchReferrer) ?? incomingReferrer ?? undefined,

        title: args.title ?? prevMetadata.title,
        userAgent: args.userAgent ?? prevMetadata.userAgent,
        cookieEnabled: args.cookieEnabled ?? prevMetadata.cookieEnabled,
        timezoneOffset: args.timezoneOffset ?? prevMetadata.timezoneOffset,

        currentUrl: effectiveCurrentUrl ?? prevMetadata.currentUrl,
        ip: args.ip ?? prevMetadata.ip,
        city: args.city ?? prevMetadata.city,
        countryCode: args.countryCode ?? prevMetadata.countryCode,
        lat: args.lat ?? prevMetadata.lat,
        lng: args.lng ?? prevMetadata.lng,

        pages: updatedPages,

        // First-touch UTMs (only set once)
        utm_source: (prevMetadata as any).utm_source ?? utmFromUrl.utm_source,
        utm_medium: (prevMetadata as any).utm_medium ?? utmFromUrl.utm_medium,
        utm_campaign: (prevMetadata as any).utm_campaign ?? utmFromUrl.utm_campaign,
        utm_term: (prevMetadata as any).utm_term ?? utmFromUrl.utm_term,
        utm_content: (prevMetadata as any).utm_content ?? utmFromUrl.utm_content,
      };
    }

    // Always merge referrer / first-touch so later heartbeats cannot wipe attribution with "".
    const mdBase = minimalUpdate.metadata ?? prevMetadata;
    const mergedReferrer = incomingReferrer ?? safeTrimRef(mdBase.referrer as string | undefined);
    const mergedFirstTouch =
      safeTrimRef((mdBase as any).firstTouchReferrer) ?? incomingReferrer ?? undefined;
    minimalUpdate.metadata = {
      ...mdBase,
      referrer: mergedReferrer,
      firstTouchReferrer: mergedFirstTouch,
      lastHeartbeatAt: now,
      // Network identity is sticky: a later heartbeat without geo must not erase it.
      ipCompanyName: args.companyName ?? (mdBase as any).ipCompanyName,
      ipCompanyDomain: args.companyDomain ?? (mdBase as any).ipCompanyDomain,
      ipConnectionType: args.connectionType ?? (mdBase as any).ipConnectionType,
    };

    // --- Territory routing: territory label always refreshes, rep assignment is sticky ---
    // The territory key keeps following Team & Territories changes immediately, but the
    // assigned rep only moves when the current one is no longer eligible. Otherwise a
    // visitor would change owner mid-visit and reps would see leads jump on the Live map.
    const cc = normCC((args.countryCode ?? (prevMetadata as any)?.countryCode) as string | undefined);

    if (cc) {
      const territoryKey = await resolveTerritoryKey(ctx, args.organizationId, cc);

      // Patch only if changed (avoid write spam)
      const prevAssignedRep = (session.assignedRepUserId as string | undefined) || undefined;
      const prevTerritory = (session.assignedTerritoryKey as string | undefined) || undefined;

      if (territoryKey !== prevTerritory) {
        minimalUpdate.assignedTerritoryKey = territoryKey;
      }

      const keepCurrentRep =
        !!prevAssignedRep &&
        (await repStillEligibleForTerritory(
          ctx,
          args.organizationId,
          prevAssignedRep,
          territoryKey,
        ));

      if (!keepCurrentRep) {
        const chosenRepUserId = await pickRepForTerritory(ctx, args.organizationId, territoryKey);
        if (chosenRepUserId && chosenRepUserId !== prevAssignedRep) {
          minimalUpdate.assignedRepUserId = chosenRepUserId;
        }
      }
    }

    await ctx.db.patch(session._id, minimalUpdate);
  },
});

/** HTTP entrypoint : préfère client_ip (widget) puis headers, puis DEV_GEO_IP */
export const heartbeatHttp = internalAction({
  args: {
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
    currentUrl: v.optional(v.string()),
    referrer: v.optional(v.string()),
    language: v.optional(v.string()),
    timezone: v.optional(v.string()),
    viewportSize: v.optional(v.string()),
    screenResolution: v.optional(v.string()),
    client_ip: v.optional(v.string()),
    x_forwarded_for: v.optional(v.string()),
    x_real_ip: v.optional(v.string()),
    cf_connecting_ip: v.optional(v.string()),
    x_vercel_forwarded_for: v.optional(v.string()),
    true_client_ip: v.optional(v.string()),
    fly_client_ip: v.optional(v.string()),
    x_client_ip: v.optional(v.string()),
    remote_addr: v.optional(v.string()),
    title: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    cookieEnabled: v.optional(v.boolean()),
    timezoneOffset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const fromHeaders = (): string | undefined => {
      const fromXff = args.x_forwarded_for?.split(",")[0]?.trim();
      const pick =
        fromXff ||
        args.x_real_ip ||
        args.true_client_ip ||
        args.fly_client_ip ||
        args.x_client_ip ||
        args.cf_connecting_ip ||
        args.x_vercel_forwarded_for ||
        args.remote_addr;
      return pick;
    };

    let ip =
      (args.client_ip && !isPrivateOrLoopback(args.client_ip) ? args.client_ip : undefined) || fromHeaders();

    if (ip && isPrivateOrLoopback(ip)) ip = undefined;
    if (!ip && process.env.DEV_GEO_IP) ip = process.env.DEV_GEO_IP;

    let city: string | undefined;
    let countryCode: string | undefined;
    let lat: number | undefined;
    let lng: number | undefined;
    let companyName: string | undefined;
    let companyDomain: string | undefined;
    let connectionType: string | undefined;

    if (ip) {
      try {
        const geo = await ctx.runAction(internal.live.lookupIp, { ip });
        city = geo.city;
        countryCode = geo.countryCode;
        lat = geo.lat;
        lng = geo.lng;
        companyName = geo.companyName;
        companyDomain = geo.companyDomain;
        connectionType = geo.connectionType;
      } catch {
        // best-effort
      }
    }

    await ctx.runMutation(internal.live.upsertHeartbeat, {
      organizationId: args.organizationId,
      contactSessionId: args.contactSessionId,
      currentUrl: args.currentUrl,
      referrer: args.referrer,
      language: args.language,
      timezone: args.timezone,
      viewportSize: args.viewportSize,
      screenResolution: args.screenResolution,
      ip,
      city,
      countryCode,
      lat,
      lng,
      companyName,
      companyDomain,
      connectionType,
      title: args.title,
      userAgent: args.userAgent,
      cookieEnabled: args.cookieEnabled,
      timezoneOffset: args.timezoneOffset,
    });
  },
});
