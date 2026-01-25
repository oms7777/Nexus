// packages/backend/convex/live.ts
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
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

/** TTL du cache IP (24h) */
const GEO_TTL_MS = 24 * 60 * 60 * 1000;
/** Visiteur "actif" pendant 15min après le dernier heartbeat */
const SESSION_TTL_MS = 90 * 1000;

/** Cache lookup */
export const getCached = internalQuery({
  args: { ip: v.string() },
  handler: async (ctx, { ip }) => {
    const now = Date.now();
    const row = await ctx.db
      .query("ipGeoCache")
      .withIndex("by_ip", (q) => q.eq("ip", ip))
      .unique();
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
    const existing = await ctx.db
      .query("ipGeoCache")
      .withIndex("by_ip", (q) => q.eq("ip", args.ip))
      .unique();

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

export interface GeoResult {
  city?: string;
  countryCode?: string;
  lat?: number;
  lng?: number;
}

/** Lookup IP (ipdata) + cache */
export const lookupIp = internalAction({
  args: { ip: v.string() },
  handler: async (ctx, { ip }): Promise<GeoResult> => {
    // 1) cache
    const cached = await ctx.runQuery(internal.live.getCached, { ip });
    if (cached) {
      return {
        city: cached.city,
        countryCode: cached.countryCode,
        lat: cached.lat,
        lng: cached.lng,
      };
    }

    // 2) ipdata
    const key = process.env.IPDATA_API_KEY;
    const url = `https://api.ipdata.co/${encodeURIComponent(ip)}?api-key=${key ?? ""}`;

    try {
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

      await ctx.runMutation(internal.live.setCached, { ip, city, countryCode, lat, lng });
      return { city, countryCode, lat, lng };
    } catch {
      return { city: undefined, countryCode: undefined, lat: undefined, lng: undefined };
    }
  },
});

/** Upsert heartbeat + enrich metadata + bump session TTL */
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
    // Ajout des nouveaux champs du client
    title: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    cookieEnabled: v.optional(v.boolean()),
    timezoneOffset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.contactSessionId);
    if (!session || session.organizationId !== args.organizationId) return;

    // 1. DÉBUT DU PATCH MINIMAL
    const minimalUpdate: Record<string, any> = {
      // <<< keep active >>> : La seule mise à jour essentielle pour le heartbeat
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    
    const prevMetadata = session.metadata ?? {};
    
    // 2. Vérification des changements majeurs : URL (navigation) ou données GEO (enrichissement initial)
    const urlChanged = args.currentUrl && args.currentUrl !== prevMetadata.currentUrl;
    const geoDataAvailable = args.city || args.countryCode || args.lat || args.lng;
    
    // 3. MISE À JOUR D'ENRICHISSEMENT (METADATA) - SEULEMENT si URL ou GEO a changé
    if (urlChanged || geoDataAvailable) {
      const prevPages: string[] = Array.isArray(prevMetadata.pages)
        ? (prevMetadata.pages as string[])
        : [];

      const addPage = (pages: string[], url?: string) => {
        if (!url || url.length <= 3) return pages;
        if (pages[0] === url) return pages;
        return [url, ...pages];
      };

      // Mettre à jour la liste des pages uniquement si l'URL a changé
      const updatedPages = urlChanged 
        ? addPage(prevPages, args.currentUrl).slice(0, 10)
        : prevPages;

      minimalUpdate.metadata = {
        ...prevMetadata,
        // Champs mis à jour du client (même s'ils sont redondants, on assure qu'ils sont mis à jour)
        language: args.language ?? prevMetadata.language,
        screenResolution: args.screenResolution ?? prevMetadata.screenResolution,
        viewportSize: args.viewportSize ?? prevMetadata.viewportSize,
        timezone: args.timezone ?? prevMetadata.timezone,
        referrer: args.referrer ?? prevMetadata.referrer,
        
        // Nouveaux champs
        title: args.title ?? prevMetadata.title,
        userAgent: args.userAgent ?? prevMetadata.userAgent,
        cookieEnabled: args.cookieEnabled ?? prevMetadata.cookieEnabled,
        timezoneOffset: args.timezoneOffset ?? prevMetadata.timezoneOffset,
        
        // Champs potentiellement changeants (CurrentUrl, IP, Geo)
        currentUrl: args.currentUrl ?? prevMetadata.currentUrl,
        ip: args.ip ?? prevMetadata.ip,
        city: args.city ?? prevMetadata.city,
        countryCode: args.countryCode ?? prevMetadata.countryCode,
        lat: args.lat ?? prevMetadata.lat,
        lng: args.lng ?? prevMetadata.lng,
        
        pages: updatedPages,
      };
    }
    
    // 4. Application du patch. La majorité des appels feront uniquement la mise à jour d'expiresAt.
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
    // widget-provided public IP
    client_ip: v.optional(v.string()),
    // headers fallback (flattened)
    x_forwarded_for: v.optional(v.string()),
    x_real_ip: v.optional(v.string()),
    cf_connecting_ip: v.optional(v.string()),
    x_vercel_forwarded_for: v.optional(v.string()),
    remote_addr: v.optional(v.string()),
    // Nouveaux champs
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
        args.cf_connecting_ip ||
        args.x_vercel_forwarded_for ||
        args.remote_addr;
      return pick;
    };

    let ip =
      (args.client_ip && !isPrivateOrLoopback(args.client_ip) ? args.client_ip : undefined) ||
      fromHeaders();

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
      // Nouveaux champs passés à la mutation
      title: args.title,
      userAgent: args.userAgent,
      cookieEnabled: args.cookieEnabled,
      timezoneOffset: args.timezoneOffset,
    });
  },
});