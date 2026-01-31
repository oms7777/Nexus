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

/** Lookup IP (ipdata) + cache */
export const lookupIp = internalAction({
  args: { ip: v.string() },
  handler: async (ctx, { ip }): Promise<GeoResult> => {
    const cached = await ctx.runQuery(internal.live.getCached, { ip });
    if (cached) {
      return { city: cached.city, countryCode: cached.countryCode, lat: cached.lat, lng: cached.lng };
    }

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

/** -------------------------------------------------------------
 * Territory routing helpers
 * ----------------------------------------------------------- */
async function resolveTerritoryKey(ctx: any, organizationId: string, countryCode?: string) {
  if (!countryCode) return undefined;

  const cc = String(countryCode).toUpperCase();

  const territories = await ctx.db
    .query("territories")
    .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
    .collect();

  // match by countryCodes includes
  const match = territories.find((t: any) =>
    Array.isArray(t.countryCodes) ? t.countryCodes.map((x: string) => x.toUpperCase()).includes(cc) : false
  );

  return match?.key as string | undefined;
}

async function pickRepForTerritory(ctx: any, organizationId: string, territoryKey?: string) {
  const reps = await ctx.db
    .query("repsPresence")
    .withIndex("by_org_role", (q: any) => q.eq("organizationId", organizationId).eq("role", "sales"))
    .collect();

  const available = reps.filter((r: any) => r.available === true);

  if (!available.length) return undefined;

  if (territoryKey) {
    const byTerritory = available.filter((r: any) => {
      const regions = Array.isArray(r.regions) ? (r.regions as string[]) : [];
      return regions.includes(territoryKey);
    });
    if (byTerritory.length) return byTerritory[0].userId as string;
  }

  // fallback: first available sales rep
  return available[0].userId as string;
}

async function preferredRepMatchesTerritory(ctx: any, organizationId: string, repUserId: string, territoryKey?: string) {
  const presence = await ctx.db
    .query("repsPresence")
    .withIndex("by_org_user", (q: any) => q.eq("organizationId", organizationId).eq("userId", repUserId))
    .unique();

  if (!presence) return false;
  if (presence.available !== true) return false;
  if (presence.role !== "sales") return false;

  if (!territoryKey) return true;

  const regions = Array.isArray(presence.regions) ? (presence.regions as string[]) : [];
  return regions.includes(territoryKey);
}

/** Upsert heartbeat + enrich metadata + bump session TTL + territory assign */
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

    const prevMetadata = session.metadata ?? {};
    const minimalUpdate: Record<string, any> = {
      expiresAt: Date.now() + SESSION_TTL_MS,
    };

    const urlChanged = args.currentUrl && args.currentUrl !== prevMetadata.currentUrl;

    const geoDataAvailable = args.city || args.countryCode || args.lat || args.lng;

    if (urlChanged || geoDataAvailable) {
      const prevPages: string[] = Array.isArray(prevMetadata.pages) ? (prevMetadata.pages as string[]) : [];

      const addPage = (pages: string[], url?: string) => {
        if (!url || url.length <= 3) return pages;
        if (pages[0] === url) return pages;
        return [url, ...pages];
      };

      const updatedPages = urlChanged ? addPage(prevPages, args.currentUrl).slice(0, 10) : prevPages;

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

        currentUrl: args.currentUrl ?? prevMetadata.currentUrl,
        ip: args.ip ?? prevMetadata.ip,
        city: args.city ?? prevMetadata.city,
        countryCode: args.countryCode ?? prevMetadata.countryCode,
        lat: args.lat ?? prevMetadata.lat,
        lng: args.lng ?? prevMetadata.lng,

        pages: updatedPages,
      };
    }

    // ✅ TERRITORY ASSIGNMENT (only if not already assigned)
    const hasAssigned = typeof session.assignedRepUserId === "string" && session.assignedRepUserId.length > 0;

    // resolve countryCode (prefer new arg, else metadata)
    const cc =
      (args.countryCode ?? (prevMetadata as any)?.countryCode ?? undefined) as string | undefined;

    if (!hasAssigned && cc) {
      const territoryKey = await resolveTerritoryKey(ctx, args.organizationId, cc);

      // preferred rep: prefer top-level then metadata legacy
      const preferredRepUserId =
        (session.preferredRepUserId as string | undefined) ||
        ((prevMetadata as any)?.preferredRepUserId as string | undefined);

      let chosenRepUserId: string | undefined;

      if (preferredRepUserId) {
        const ok = await preferredRepMatchesTerritory(ctx, args.organizationId, preferredRepUserId, territoryKey);
        if (ok) chosenRepUserId = preferredRepUserId;
      }

      if (!chosenRepUserId) {
        chosenRepUserId = await pickRepForTerritory(ctx, args.organizationId, territoryKey);
      }

      if (chosenRepUserId) {
        minimalUpdate.assignedRepUserId = chosenRepUserId;
        minimalUpdate.assignedTerritoryKey = territoryKey;
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
