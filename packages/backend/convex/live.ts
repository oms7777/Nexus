// packages/backend/convex/live.ts
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

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
  };

  const city = data.city ?? undefined;
  const countryCode = data.country_code ?? undefined;
  const lat = typeof data.latitude === "number" ? data.latitude : undefined;
  const lng = typeof data.longitude === "number" ? data.longitude : undefined;
  return { city, countryCode, lat, lng };
}

/**
 * HTTPS fallback when ipdata is not configured or errors.
 * Prefer setting IPDATA_API_KEY in production (SLA / limits).
 */
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

/** Lookup IP (ipdata preferred, ipwho.is fallback) + cache */
export const lookupIp = internalAction({
  args: { ip: v.string() },
  handler: async (ctx, { ip }): Promise<GeoResult> => {
    const cached = await ctx.runQuery(internal.live.getCached, { ip });
    if (cached) {
      return { city: cached.city, countryCode: cached.countryCode, lat: cached.lat, lng: cached.lng };
    }

    let result: GeoResult | null = null;

    try {
      result = await geoFromIpdata(ip);
    } catch {
      result = null;
    }

    if (!result || (result.lat == null && result.lng == null && !result.countryCode)) {
      try {
        result = await geoFromIpWhoFallback(ip);
      } catch {
        result = null;
      }
    }

    if (!result) {
      return { city: undefined, countryCode: undefined, lat: undefined, lng: undefined };
    }

    const { city, countryCode, lat, lng } = result;
    await ctx.runMutation(internal.live.setCached, { ip, city, countryCode, lat, lng });
    return { city, countryCode, lat, lng };
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

/** Upsert heartbeat + enrich metadata + bump session TTL + territory assign (NON-STICKY) */
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

    const minimalUpdate: Record<string, any> = {
      expiresAt: now + SESSION_TTL_MS,
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
    const urlChanged =
      !!effectiveCurrentUrl && effectiveCurrentUrl !== prevMetadata.currentUrl;
    const geoDataAvailable = args.city || args.countryCode || args.lat || args.lng;

    if (urlChanged || geoDataAvailable) {
      const prevPages: string[] = Array.isArray(prevMetadata.pages) ? (prevMetadata.pages as string[]) : [];

      const addPage = (pages: string[], url?: string) => {
        if (!url || url.length <= 3) return pages;
        if (pages[0] === url) return pages;
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
        referrer: args.referrer ?? prevMetadata.referrer,

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

    // --- NON-STICKY territory routing ---
    // We recompute assignment when we have a country code.
    // This makes changes in Team & Territories take effect immediately (next heartbeat).
    const cc = normCC((args.countryCode ?? (prevMetadata as any)?.countryCode) as string | undefined);

    if (cc) {
      const territoryKey = await resolveTerritoryKey(ctx, args.organizationId, cc);
      const chosenRepUserId = await pickRepForTerritory(ctx, args.organizationId, territoryKey);

      // Patch only if changed (avoid write spam)
      const prevAssignedRep = (session.assignedRepUserId as string | undefined) || undefined;
      const prevTerritory = (session.assignedTerritoryKey as string | undefined) || undefined;

      if (territoryKey !== prevTerritory) {
        minimalUpdate.assignedTerritoryKey = territoryKey;
      }
      if (chosenRepUserId && chosenRepUserId !== prevAssignedRep) {
        minimalUpdate.assignedRepUserId = chosenRepUserId;
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

    if (ip) {
      try {
        const geo = await ctx.runAction(internal.live.lookupIp, { ip });
        city = geo.city;
        countryCode = geo.countryCode;
        lat = geo.lat;
        lng = geo.lng;
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
      title: args.title,
      userAgent: args.userAgent,
      cookieEnabled: args.cookieEnabled,
      timezoneOffset: args.timezoneOffset,
    });
  },
});
