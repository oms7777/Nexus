// packages/backend/convex/public/analytics.ts
import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";

/* ============================================================
   Helpers
   ============================================================ */

function safeNumber(x: any, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function safeString(x: any) {
  return typeof x === "string" ? x : undefined;
}

function pickUtm(currentUrl?: string) {
  if (!currentUrl) return {};
  try {
    const u = new URL(currentUrl);
    const p = u.searchParams;

    const utm_source = p.get("utm_source") || undefined;
    const utm_medium = p.get("utm_medium") || undefined;
    const utm_campaign = p.get("utm_campaign") || undefined;
    const utm_term = p.get("utm_term") || undefined;
    const utm_content = p.get("utm_content") || undefined;

    const out: Record<string, any> = {};
    if (utm_source) out.utm_source = utm_source;
    if (utm_medium) out.utm_medium = utm_medium;
    if (utm_campaign) out.utm_campaign = utm_campaign;
    if (utm_term) out.utm_term = utm_term;
    if (utm_content) out.utm_content = utm_content;
    return out;
  } catch {
    return {};
  }
}

/** When ads platforms append click ids but marketing forgot UTMs — cheap synthetic source bucket. */
function inferSyntheticUtmSource(currentUrl?: string): string | undefined {
  if (!currentUrl) return undefined;
  try {
    const p = new URL(currentUrl).searchParams;
    if (p.get("gclid") || p.get("wbraid") || p.get("gbraid")) return "google_ads";
    if (p.get("fbclid")) return "meta_ads";
    if (p.get("msclkid")) return "microsoft_ads";
    if (p.get("li_fat_id")) return "linkedin_ads";
    return undefined;
  } catch {
    return undefined;
  }
}

function mergeMeta(base: any, extra: any) {
  const b = base && typeof base === "object" ? base : {};
  const e = extra && typeof extra === "object" ? extra : {};
  return { ...b, ...e };
}

async function enrichMetaFromSession(ctx: any, sessionId?: any) {
  if (!sessionId) return {};
  const session = await ctx.db.get(sessionId);
  const m = session?.metadata ?? {};
  const currentUrl = safeString(m.currentUrl);

  const syntheticSource = inferSyntheticUtmSource(currentUrl);

  return {
    sessionName: safeString(session?.name),
    sessionEmail: safeString(session?.email),
    /**
     * A name the visitor typed always wins; the reverse-IP company only fills the gap
     * so anonymous corporate traffic still groups into an account in Signals.
     */
    company: safeString((m as any).company) ?? safeString((m as any).ipCompanyName),
    companySource: safeString((m as any).company)
      ? "declared"
      : safeString((m as any).ipCompanyName)
        ? "ip"
        : undefined,
    ipCompanyDomain: safeString((m as any).ipCompanyDomain),
    ipConnectionType: safeString((m as any).ipConnectionType),

    city: safeString(m.city),
    countryCode: safeString(m.countryCode),
    lat: typeof m.lat === "number" ? m.lat : undefined,
    lng: typeof m.lng === "number" ? m.lng : undefined,

    currentUrl,
    referrer: safeString(m.referrer),
    firstTouchReferrer: safeString((m as any).firstTouchReferrer),
    title: safeString(m.title),

    visitorId: safeString(m.visitorId),

    // Prefer first-touch / persisted UTMs when available.
    // Fallback: parse from the currentUrl (may lose UTMs after navigation).
    // Finally: synthetic buckets from ad click ids (gclid/fbclid/…) when UTMs absent.
    utm_source:
      safeString((m as any).utm_source) ??
      (pickUtm(currentUrl) as any).utm_source ??
      syntheticSource,
    utm_medium: safeString((m as any).utm_medium) ?? (pickUtm(currentUrl) as any).utm_medium,
    utm_campaign: safeString((m as any).utm_campaign) ?? (pickUtm(currentUrl) as any).utm_campaign,
    utm_term: safeString((m as any).utm_term) ?? (pickUtm(currentUrl) as any).utm_term,
    utm_content: safeString((m as any).utm_content) ?? (pickUtm(currentUrl) as any).utm_content,
  };
}

function getSessionKey(e: any): string | null {
  if (e.sessionId) return `session:${String(e.sessionId)}`;
  const visitorId = e?.meta?.visitorId;
  if (visitorId) return `visitor:${String(visitorId)}`;
  if (e.conversationId) return `conv:${String(e.conversationId)}`;
  return null;
}

function getConversationKey(e: any): string | null {
  if (e.conversationId) return `conv:${String(e.conversationId)}`;
  return null;
}

function getMeetingKey(e: any): string | null {
  const bookingId = e?.meta?.bookingId;
  if (bookingId) return `booking:${String(bookingId)}`;
  if (e.conversationId) return `conv:${String(e.conversationId)}`;

  const email = e?.meta?.attendeeEmail;
  const ts = safeNumber(e?.ts, 0);
  const bucketMin = Math.floor(ts / 60000);
  if (email && ts) return `min:${bucketMin}:email:${String(email)}`;

  return null;
}

/** Dashboard reads must use the Clerk org on the JWT — never trust a bare organizationId. */
async function requireDashboardOrgId(ctx: any, clientOrgId: string): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
  }
  const orgId = (identity as any).orgId as string | undefined;
  if (!orgId) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
  }
  if (clientOrgId && clientOrgId !== orgId) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Organization mismatch" });
  }
  return orgId;
}

/**
 * Advanced Analytics is the `advancedAnalytics` addon (same flag as the web entitlements UI),
 * not the plan name alone — Growth without the addon must not pass here.
 */
async function requireAdvancedAnalytics(ctx: any, organizationId: string) {
  const sub = await ctx.db
    .query("subscriptions")
    .withIndex("by_organization_id", (q: any) => q.eq("organizationId", organizationId))
    .unique();

  // Local/dev often has no subscription row — keep dashboards usable there.
  if (!sub && process.env.NODE_ENV !== "production") {
    return { plan: "dev", status: "active" };
  }

  const plan = String(sub?.plan ?? "starter");
  const status = String(sub?.status ?? "paused");
  const isActive = status === "active" || status === "trial";
  const hasAdvanced = Boolean(sub?.addons?.advancedAnalytics);

  if (!isActive || !hasAdvanced) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Advanced Analytics required",
    });
  }

  return { plan, status };
}

function isNoiseSourceKey(source: string): boolean {
  const s = source.toLowerCase().trim().replace(/^www\./, "");
  if (!s || s === "direct") return false;
  if (s === "localhost" || s.startsWith("127.") || s === "0.0.0.0" || s === "::1") return true;
  if (s.endsWith(".vercel.app") || s.includes(".vercel.app")) return true;
  if (s.includes("nexus-site-") || s.includes("-oms")) return true;
  // Product host mistakenly stored as a channel (apex was missing from internal list historically).
  if (s === "inboundless.co" || s.endsWith(".inboundless.co")) return true;
  return false;
}

function countUniqueExperiences(evts: any[]): number {
  return uniqueCount(
    evts.filter((e) => e.type === "experience_shown").map((e) => getSessionKey(e)),
  );
}

function uniqueCount(keys: Array<string | null | undefined>) {
  return new Set(keys.filter(Boolean) as string[]).size;
}

function percentile(sortedNums: number[], p: number) {
  if (!sortedNums.length) return null;
  const idx = Math.ceil((p / 100) * sortedNums.length) - 1;
  return sortedNums[Math.max(0, Math.min(idx, sortedNums.length - 1))];
}

function median(sortedNums: number[]) {
  const n = sortedNums.length;
  if (n === 0) return null;

  const mid = Math.floor(n / 2);

  if (n % 2 === 1) {
    const v = sortedNums[mid];
    return typeof v === "number" ? v : null;
  }

  const a = sortedNums[mid - 1];
  const b = sortedNums[mid];
  if (typeof a !== "number" || typeof b !== "number") return null;
  return (a + b) / 2;
}

function deltaPct(current: number, previous: number) {
  if (!previous) return current ? 1 : 0;
  return (current - previous) / previous;
}

function clampTopK<T>(arr: T[], k = 8) {
  return arr.slice(0, Math.max(0, k));
}

function countryCodeToLabel(cc: string) {
  const code = String(cc ?? "").toUpperCase();
  if (!code) return "Unknown";
  try {
    // Intl.DisplayNames is available in modern Node runtimes.
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}

function dayKeyUTC(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

/* ============================================================
   Territory helpers
   ============================================================ */

async function buildCountryToTerritoryMap(ctx: any, organizationId: string) {
  const territories = await ctx.db
    .query("territories")
    .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
    .collect();

  const ccToTerr: Map<string, { key: string; label: string }> = new Map();

  for (const t of territories) {
    const key = String(t.key);
    const label = String(t.label ?? t.key);
    const codes: string[] = Array.isArray(t.countryCodes)
      ? t.countryCodes.map((c: any) => String(c).toUpperCase())
      : [];

    for (const cc of codes) {
      if (!ccToTerr.has(cc)) ccToTerr.set(cc, { key, label });
    }
  }

  return { territories, ccToTerr };
}

function getTerritoryForEvent(
  e: any,
  ccToTerr: Map<string, { key: string; label: string }>,
) {
  const meta = e?.meta ?? {};
  const cc = safeString(meta.countryCode)?.toUpperCase();

  if (!cc) return { territoryKey: "unknown", territoryLabel: "Unknown" };
  const hit = ccToTerr.get(cc);
  if (hit) return { territoryKey: hit.key, territoryLabel: hit.label };
  return { territoryKey: "other", territoryLabel: "Other" };
}

/* ============================================================
   Internal aggregation helpers
   ============================================================ */

function computeSessionsRobust(evts: any[]) {
  const sessionStarted = evts.filter((e) => e.type === "session_started");
  if (sessionStarted.length > 0) {
    return uniqueCount(sessionStarted.map((e) => (e.sessionId ? String(e.sessionId) : null)));
  }
  return uniqueCount(
    evts
      .filter((e) =>
        [
          "widget_loaded",
          "experience_shown",
          "inbound_chat_requested",
          "conversation_created",
          "calendar_slots_loaded",
          "meeting_booked",
        ].includes(e.type),
      )
      .map(getSessionKey),
  );
}

function computeConversationsUnique(evts: any[]) {
  return uniqueCount(evts.filter((e) => e.type === "conversation_created").map(getConversationKey));
}

function computeMeetingsUnique(evts: any[]) {
  return uniqueCount(evts.filter((e) => e.type === "meeting_booked").map(getMeetingKey));
}

function computeFirstResponseStats(evts: any[], slaSeconds?: number) {
  const startByConv = new Map<string, number>();
  for (const e of evts) {
    if (e.type !== "inbound_chat_requested" && e.type !== "conversation_created") continue;
    const ck = getConversationKey(e);
    if (!ck) continue;
    const t = safeNumber(e.ts, 0);
    if (!startByConv.has(ck)) startByConv.set(ck, t);
    else startByConv.set(ck, Math.min(startByConv.get(ck)!, t));
  }

  const repStartByConv = new Map<string, number>();
  for (const e of evts) {
    if (e.type !== "inbound_rep_started") continue;
    const ck = getConversationKey(e);
    if (!ck) continue;
    const t = safeNumber(e.ts, 0);
    const cur = repStartByConv.get(ck);
    if (!cur || t < cur) repStartByConv.set(ck, t);
  }

  const times: number[] = [];
  let withinSla = 0;

  for (const [ck, startTs] of startByConv.entries()) {
    const repTs = repStartByConv.get(ck);
    if (!repTs || !startTs) continue;
    const dtSec = Math.max(0, Math.round((repTs - startTs) / 1000));
    times.push(dtSec);
    if (typeof slaSeconds === "number" && dtSec <= slaSeconds) withinSla += 1;
  }

  times.sort((a, b) => a - b);

  return {
    conversations_with_rep: times.length,
    median_sec: median(times),
    p90_sec: percentile(times, 90),
    p99_sec: percentile(times, 99),
    within_sla_rate:
      typeof slaSeconds === "number" && times.length ? withinSla / times.length : null,
    slaSeconds: typeof slaSeconds === "number" ? slaSeconds : null,
  };
}

function normalizeSource(meta: any) {
  // Prefer explicit UTM when present (embed / campaign attribution).
  const s = safeString(meta?.utm_source);
  if (s) return s;

  // Synthetic source from URL click ids (set in enrichMeta before this runs).
  const syn = inferSyntheticUtmSource(safeString(meta?.currentUrl));
  if (syn) return syn;

  const ref =
    safeString(meta?.firstTouchReferrer) || safeString(meta?.referrer);
  if (!ref) return "direct";

  // Ignore widget/app/internal referrers (they are not acquisition sources).
  // This avoids polluting "Top sources" with `widget.inboundless.co` / `app.*` and similar.
  const isInternalReferrerHost = (host: string) => {
    const h = host.replace(/^www\./, "").toLowerCase();
    return (
      h === "inboundless.co" ||
      h === "widget.inboundless.co" ||
      h === "app.inboundless.co" ||
      // Apex + any subdomain of inboundless.co are product/site, not a paid channel.
      h.endsWith(".inboundless.co")
    );
  };

  // Avoid "self-referrals" which are usually internal navigation / SPA reloads.
  // If referrer host matches currentUrl host, treat as direct/unattributed.
  const cur = safeString(meta?.currentUrl);
  try {
    const refUrl = new URL(ref);
    const refHost = refUrl.hostname.replace(/^www\./, "");
    if (!refHost) return "referral";
    if (isInternalReferrerHost(refHost)) return "direct";

    if (cur) {
      try {
        const curUrl = new URL(cur);
        const curHost = curUrl.hostname.replace(/^www\./, "");
        if (curHost && curHost === refHost) return "direct";
      } catch {
        // ignore currentUrl parse errors; fall back to referrer host below
      }
    }

    return refHost;
  } catch {
    return "referral";
  }
}

function normalizePage(meta: any) {
  const url = safeString(meta?.currentUrl);
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.pathname || "/";
  } catch {
    return url.slice(0, 200);
  }
}

/* ============================================================
   Events logging
   ============================================================ */

export const log = mutation({
  args: {
    organizationId: v.string(),
    type: v.string(),
    ts: v.optional(v.number()),
    userId: v.optional(v.string()),
    sessionId: v.optional(v.id("contactSessions")),
    conversationId: v.optional(v.id("conversations")),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Widget writes stay unauthenticated, but must prove they own a session/conversation
    // in this org — otherwise anyone with an org id could forge KPIs.
    if (args.sessionId) {
      const session = await ctx.db.get(args.sessionId);
      if (!session || session.organizationId !== args.organizationId) {
        throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid session" });
      }
    } else if (args.conversationId) {
      const conversation = await ctx.db.get(args.conversationId);
      if (!conversation || conversation.organizationId !== args.organizationId) {
        throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid conversation" });
      }
    } else {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "sessionId or conversationId is required",
      });
    }

    const sessionMeta = await enrichMetaFromSession(ctx, args.sessionId);

    await ctx.db.insert("analyticsEvents", {
      organizationId: args.organizationId,
      type: args.type,
      ts: args.ts ?? Date.now(),
      userId: args.userId,
      sessionId: args.sessionId,
      conversationId: args.conversationId,
      meta: mergeMeta(args.meta, sessionMeta),
    });

    return { ok: true };
  },
});

export const hasInboundRepStarted = query({
  args: {
    organizationId: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { organizationId, conversationId }) => {
    const hit = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_conversation", (q: any) => q.eq("conversationId", conversationId))
      .filter((q: any) => q.eq(q.field("type"), "inbound_rep_started"))
      .first();

    if (hit && hit.organizationId !== organizationId) return false;
    return !!hit;
  },
});

/* ============================================================
   OVERVIEW
   ============================================================ */

export const overview = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
    slaSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const organizationId = await requireDashboardOrgId(ctx, args.organizationId);
    const { fromTs, toTs, slaSeconds } = args;

    const evts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q: any) =>
        q.eq("organizationId", organizationId).gte("ts", fromTs).lte("ts", toTs),
      )
      .collect();

    const duration = Math.max(1, toTs - fromTs);
    const prevFrom = fromTs - duration;
    const prevTo = fromTs - 1;

    const prevEvts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q: any) =>
        q.eq("organizationId", organizationId).gte("ts", prevFrom).lte("ts", prevTo),
      )
      .collect();

    const sessions = computeSessionsRobust(evts);
    const experiences = countUniqueExperiences(evts);
    const inboundRequests = evts.filter((e) => e.type === "inbound_chat_requested").length;
    const conversations = computeConversationsUnique(evts);
    const meetings = computeMeetingsUnique(evts);

    const prevSessions = computeSessionsRobust(prevEvts);
    const prevExperiences = countUniqueExperiences(prevEvts);
    const prevInboundRequests = prevEvts.filter((e) => e.type === "inbound_chat_requested").length;
    const prevConversations = computeConversationsUnique(prevEvts);
    const prevMeetings = computeMeetingsUnique(prevEvts);

    const inbound_response = computeFirstResponseStats(evts, slaSeconds);

    // Top sources
    const sourceAgg = new Map<
      string,
      { sessions: Set<string>; conversations: Set<string>; meetings: Set<string> }
    >();

    const ensureSource = (src: string) => {
      let r = sourceAgg.get(src);
      if (!r) {
        r = { sessions: new Set(), conversations: new Set(), meetings: new Set() };
        sourceAgg.set(src, r);
      }
      return r;
    };

    for (const e of evts) {
      const src = normalizeSource(e.meta ?? {});
      const r = ensureSource(src);

      const sk = getSessionKey(e);
      if (sk) r.sessions.add(sk);

      const ck = getConversationKey(e);
      if (ck && e.type === "conversation_created") r.conversations.add(ck);

      if (e.type === "meeting_booked") {
        const mk = getMeetingKey(e);
        if (mk) r.meetings.add(mk);
      }
    }

    const top_sources = [...sourceAgg.entries()]
      .map(([source, r]) => ({
        source,
        sessions: r.sessions.size,
        conversations: r.conversations.size,
        meetings: r.meetings.size,
      }))
      .filter((r) => !isNoiseSourceKey(r.source))
      .sort(
        (a, b) => b.meetings - a.meetings || b.conversations - a.conversations || b.sessions - a.sessions,
      );

    // Territories (by territory groups)
    const { ccToTerr, territories } = await buildCountryToTerritoryMap(ctx, organizationId);

    const terrAgg = new Map<
      string,
      { label: string; sessions: Set<string>; conversations: Set<string>; meetings: Set<string> }
    >();

    const ensureTerr = (key: string, label: string) => {
      let r = terrAgg.get(key);
      if (!r) {
        r = { label, sessions: new Set(), conversations: new Set(), meetings: new Set() };
        terrAgg.set(key, r);
      }
      return r;
    };

    for (const e of evts) {
      const t = getTerritoryForEvent(e, ccToTerr);
      const r = ensureTerr(t.territoryKey, t.territoryLabel);

      const sk = getSessionKey(e);
      if (sk) r.sessions.add(sk);

      const ck = getConversationKey(e);
      if (ck && e.type === "conversation_created") r.conversations.add(ck);

      if (e.type === "meeting_booked") {
        const mk = getMeetingKey(e);
        if (mk) r.meetings.add(mk);
      }
    }

    const top_territories = [...terrAgg.entries()]
      .map(([territoryKey, r]) => ({
        territoryKey,
        territoryLabel: r.label,
        sessions: r.sessions.size,
        conversations: r.conversations.size,
        meetings: r.meetings.size,
      }))
      .sort(
        (a, b) => b.meetings - a.meetings || b.conversations - a.conversations || b.sessions - a.sessions,
      );

    // For UI drill-down: territory -> which countries it covers.
    // (Needed because territories can include many countries; "Whole world" can otherwise shadow everything.)
    const terrKeyToCountryCodes = new Map<string, string[]>();
    for (const t of territories) {
      const key = String(t.key);
      const codes = Array.isArray(t.countryCodes) ? t.countryCodes.map((c: any) => String(c).toUpperCase()) : [];
      terrKeyToCountryCodes.set(key, codes);
    }

    const top_territories_countryCodes = top_territories.map((t) => ({
      territoryKey: t.territoryKey,
      territoryLabel: t.territoryLabel,
      countryCodes: terrKeyToCountryCodes.get(t.territoryKey) ?? [],
    }));

    // Countries (by raw countryCode from geo metadata)
    // Note: territories can collapse everything into "Whole world" depending on tenant configuration.
    const countryAgg = new Map<
      string,
      { label: string; sessions: Set<string>; conversations: Set<string>; meetings: Set<string> }
    >();

    const ensureCountry = (cc: string) => {
      const key = String(cc ?? "").toUpperCase();
      let r = countryAgg.get(key);
      if (!r) {
        r = { label: countryCodeToLabel(key), sessions: new Set(), conversations: new Set(), meetings: new Set() };
        countryAgg.set(key, r);
      }
      return r;
    };

    for (const e of evts) {
      const cc = safeString(e?.meta?.countryCode)?.toUpperCase();
      const c = cc || "UNKNOWN";
      const r = ensureCountry(c);

      const sk = getSessionKey(e);
      if (sk) r.sessions.add(sk);

      const ck = getConversationKey(e);
      if (ck && e.type === "conversation_created") r.conversations.add(ck);

      if (e.type === "meeting_booked") {
        const mk = getMeetingKey(e);
        if (mk) r.meetings.add(mk);
      }
    }

    const top_countries = [...countryAgg.entries()]
      .map(([countryCode, r]) => ({
        countryCode,
        countryLabel: r.label,
        sessions: r.sessions.size,
        conversations: r.conversations.size,
        meetings: r.meetings.size,
      }))
      .sort(
        (a, b) => b.meetings - a.meetings || b.conversations - a.conversations || b.sessions - a.sessions,
      );

    // Top pages
    const pageAgg = new Map<
      string,
      { sessions: Set<string>; conversations: Set<string>; meetings: Set<string> }
    >();
    const ensurePage = (p: string) => {
      let r = pageAgg.get(p);
      if (!r) {
        r = { sessions: new Set(), conversations: new Set(), meetings: new Set() };
        pageAgg.set(p, r);
      }
      return r;
    };

    for (const e of evts) {
      const page = normalizePage(e.meta ?? {});
      if (!page) continue;
      const r = ensurePage(page);

      const sk = getSessionKey(e);
      if (sk) r.sessions.add(sk);

      const ck = getConversationKey(e);
      if (ck && e.type === "conversation_created") r.conversations.add(ck);

      if (e.type === "meeting_booked") {
        const mk = getMeetingKey(e);
        if (mk) r.meetings.add(mk);
      }
    }

    const top_pages = [...pageAgg.entries()]
      .map(([page, r]) => ({
        page,
        sessions: r.sessions.size,
        conversations: r.conversations.size,
        meetings: r.meetings.size,
      }))
      .sort(
        (a, b) => b.meetings - a.meetings || b.conversations - a.conversations || b.sessions - a.sessions,
      )
      .slice(0, 8);

    // Paths that book: source × page, ranked by meetings then meeting rate (not volume).
    const pathAgg = new Map<
      string,
      {
        source: string;
        page: string;
        sessions: Set<string>;
        conversations: Set<string>;
        meetings: Set<string>;
        conversationIds: Set<string>;
      }
    >();
    const ensurePath = (source: string, page: string) => {
      const key = `${source}\0${page}`;
      let r = pathAgg.get(key);
      if (!r) {
        r = {
          source,
          page,
          sessions: new Set(),
          conversations: new Set(),
          meetings: new Set(),
          conversationIds: new Set(),
        };
        pathAgg.set(key, r);
      }
      return r;
    };

    for (const e of evts) {
      const meta = e.meta ?? {};
      const source = normalizeSource(meta);
      if (isNoiseSourceKey(source)) continue;
      const page = normalizePage(meta) || "/";
      const r = ensurePath(source, page);

      const sk = getSessionKey(e);
      if (sk) r.sessions.add(sk);

      const ck = getConversationKey(e);
      if (ck && e.type === "conversation_created") {
        r.conversations.add(ck);
        if (e.conversationId) r.conversationIds.add(String(e.conversationId));
      }

      if (e.type === "meeting_booked") {
        const mk = getMeetingKey(e);
        if (mk) r.meetings.add(mk);
        if (e.conversationId) r.conversationIds.add(String(e.conversationId));
      }
    }

    const booking_paths = [...pathAgg.values()]
      .map((r) => {
        const sess = r.sessions.size;
        const mtg = r.meetings.size;
        return {
          source: r.source,
          page: r.page,
          sessions: sess,
          conversations: r.conversations.size,
          meetings: mtg,
          meetingRate: sess > 0 ? mtg / sess : 0,
          conversationIds: [...r.conversationIds].slice(0, 12),
        };
      })
      .sort(
        (a, b) =>
          b.meetings - a.meetings ||
          b.meetingRate - a.meetingRate ||
          b.conversations - a.conversations ||
          b.sessions - a.sessions,
      )
      .slice(0, 12);

    // Verdict sentence for the hero (no LLM).
    let booking_insight: string | null = null;
    const bestPath = booking_paths.find((p) => p.meetings > 0);
    const loudNoBook = booking_paths
      .filter((p) => p.meetings === 0 && p.sessions >= 5)
      .sort((a, b) => b.sessions - a.sessions)[0];
    if (meetings === 0 && sessions >= 10) {
      booking_insight = `${sessions.toLocaleString()} sessions, 0 meetings booked — traffic is not converting in this period.`;
    } else if (bestPath) {
      const ratePct = (bestPath.meetingRate * 100).toFixed(0);
      const srcLabel = bestPath.source === "direct" ? "Direct" : bestPath.source;
      if (loudNoBook && loudNoBook.sessions > bestPath.sessions * 1.5) {
        const loudSrc = loudNoBook.source === "direct" ? "Direct" : loudNoBook.source;
        booking_insight = `${srcLabel} → ${bestPath.page} booked (${bestPath.meetings} meeting${bestPath.meetings === 1 ? "" : "s"}, ${ratePct}% rate). High volume ${loudSrc} → ${loudNoBook.page} (${loudNoBook.sessions} sessions) produced none.`;
      } else {
        booking_insight = `${srcLabel} → ${bestPath.page}: ${ratePct}% meeting rate (${bestPath.meetings} of ${bestPath.sessions} sessions).`;
      }
    } else if (meetings > 0) {
      booking_insight = `${meetings.toLocaleString()} meeting${meetings === 1 ? "" : "s"} booked — path attribution is thin for this period.`;
    }

    return {
      period: { fromTs, toTs, durationMs: duration },
      kpi: { sessions, experiences, inboundRequests, conversations, meetings },
      deltas: {
        sessions: deltaPct(sessions, prevSessions),
        experiences: deltaPct(experiences, prevExperiences),
        inboundRequests: deltaPct(inboundRequests, prevInboundRequests),
        conversations: deltaPct(conversations, prevConversations),
        meetings: deltaPct(meetings, prevMeetings),
      },
      inbound_response,
      booking_insight,
      booking_paths,
      top_sources: clampTopK(top_sources, 8),
      top_territories: clampTopK(top_territories, 8),
      top_countries: clampTopK(top_countries, 8),
      top_territories_countryCodes: clampTopK(top_territories_countryCodes, 8),
      top_pages,
    };
  },
});

/* ============================================================
   FUNNELS  ✅ UPDATED (no SLA / no rep available)
   ============================================================ */

export const funnels = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
    // ✅ removed slaSeconds
  },
  handler: async (ctx, args) => {
    const organizationId = await requireDashboardOrgId(ctx, args.organizationId);
    await requireAdvancedAnalytics(ctx, organizationId);
    const { fromTs, toTs } = args;

    const evts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q: any) =>
        q.eq("organizationId", organizationId).gte("ts", fromTs).lte("ts", toTs),
      )
      .collect();

    const duration = Math.max(1, toTs - fromTs);
    const prevFrom = fromTs - duration;
    const prevTo = fromTs - 1;
    const prevEvts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q: any) =>
        q.eq("organizationId", organizationId).gte("ts", prevFrom).lte("ts", prevTo),
      )
      .collect();

    const sessions = computeSessionsRobust(evts);
    const experiences = countUniqueExperiences(evts);
    const conversations = computeConversationsUnique(evts);
    const meetings = computeMeetingsUnique(evts);

    const prevMeetings = computeMeetingsUnique(prevEvts);

    const inboundRequests = evts.filter((e) => e.type === "inbound_chat_requested").length;

    // Rep started = unique conv where inbound_rep_started exists
    const repStartedUnique = uniqueCount(
      evts.filter((e) => e.type === "inbound_rep_started").map(getConversationKey),
    );

    // ✅ Booking proposed (timeout 30s)
    // event name: "booking_proposed"
    const bookingProposedUnique = uniqueCount(
      evts.filter((e) => e.type === "booking_proposed").map(getConversationKey),
    );

    // ✅ Meetings booked for inbound (optional)
    // For now we reuse global meetings (same as engagement.meetings).
    // If later you want "only meetings that came from booking flow", filter by meta.source etc.
    const meetingsBooked = meetings;

    const engagement = { sessions, experiences, conversations, meetings };

    const conversion = {
      meetings_from_conversations_num: meetings,
      meetings_from_conversations_den: conversations,
      conversations_from_experiences_num: conversations,
      conversations_from_experiences_den: experiences,
    };

    const inbound = {
      requests: inboundRequests,
      rep_started: repStartedUnique,
      booking_proposed: bookingProposedUnique,
      meetings_booked: meetingsBooked,
    };

    const pounce = {
      attempts: evts.filter((e) => e.type === "pounce_attempt").length,
      conversations: evts.filter((e) => e.type === "pounce_conversation").length,
      meetings: evts.filter((e) => e.type === "pounce_meeting").length,
    };

    return {
      engagement,
      conversion,
      inbound,
      pounce,
      primaryOutcome: {
        meetings,
        sessions,
        conversations,
        meetingsDelta: deltaPct(meetings, prevMeetings),
      },
    };
  },
});

/* ============================================================
   territoryBreakdown (unchanged)
   ============================================================ */

export const territoryBreakdown = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
  },
  handler: async (ctx, args) => {
    const organizationId = await requireDashboardOrgId(ctx, args.organizationId);
    const { fromTs, toTs } = args;

    const evts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q: any) =>
        q.eq("organizationId", organizationId).gte("ts", fromTs).lte("ts", toTs),
      )
      .collect();

    const { ccToTerr } = await buildCountryToTerritoryMap(ctx, organizationId);

    const terrAgg = new Map<
      string,
      { label: string; sessions: Set<string>; conversations: Set<string>; meetings: Set<string> }
    >();

    const ensureTerr = (k: string, label: string) => {
      let r = terrAgg.get(k);
      if (!r) {
        r = { label, sessions: new Set(), conversations: new Set(), meetings: new Set() };
        terrAgg.set(k, r);
      }
      return r;
    };

    for (const e of evts) {
      const t = getTerritoryForEvent(e, ccToTerr);
      const r = ensureTerr(t.territoryKey, t.territoryLabel);

      const sk = getSessionKey(e);
      if (sk) r.sessions.add(sk);

      const ck = getConversationKey(e);
      if (ck && e.type === "conversation_created") r.conversations.add(ck);

      if (e.type === "meeting_booked") {
        const mk = getMeetingKey(e);
        if (mk) r.meetings.add(mk);
      }
    }

    return [...terrAgg.entries()]
      .map(([territoryKey, r]) => ({
        territoryKey,
        territoryLabel: r.label,
        sessions: r.sessions.size,
        conversations: r.conversations.size,
        meetings: r.meetings.size,
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10);
  },
});

/* ============================================================
   timeseries (unchanged)
   ============================================================ */

export const timeseries = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
    groupBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organizationId = await requireDashboardOrgId(ctx, args.organizationId);
    const { fromTs, toTs, groupBy } = args;

    const evts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q: any) =>
        q.eq("organizationId", organizationId).gte("ts", fromTs).lte("ts", toTs),
      )
      .collect();

    const gb = groupBy ?? "territory";
    const { ccToTerr } = await buildCountryToTerritoryMap(ctx, organizationId);

    const agg = new Map<
      string,
      Map<
        string,
        { label: string; sessions: Set<string>; conversations: Set<string>; meetings: Set<string> }
      >
    >();

    const ensure = (day: string, gk: string, label: string) => {
      let byGroup = agg.get(day);
      if (!byGroup) {
        byGroup = new Map();
        agg.set(day, byGroup);
      }
      let r = byGroup.get(gk);
      if (!r) {
        r = { label, sessions: new Set(), conversations: new Set(), meetings: new Set() };
        byGroup.set(gk, r);
      }
      return r;
    };

    for (const e of evts) {
      const day = dayKeyUTC(safeNumber(e.ts, 0));
      let gk = "unknown";
      let gl = "Unknown";

      if (gb === "territory") {
        const t = getTerritoryForEvent(e, ccToTerr);
        gk = t.territoryKey;
        gl = t.territoryLabel;
      } else if (gb === "source") {
        gk = normalizeSource(e.meta ?? {});
        gl = gk;
      }

      const r = ensure(day, gk, gl);

      const sk = getSessionKey(e);
      if (sk) r.sessions.add(sk);

      const ck = getConversationKey(e);
      if (ck && e.type === "conversation_created") r.conversations.add(ck);

      if (e.type === "meeting_booked") {
        const mk = getMeetingKey(e);
        if (mk) r.meetings.add(mk);
      }
    }

    const out: Array<{
      day: string;
      groupKey: string;
      groupLabel: string;
      sessions: number;
      conversations: number;
      meetings: number;
    }> = [];

    for (const [day, byGroup] of agg.entries()) {
      for (const [groupKey, r] of byGroup.entries()) {
        out.push({
          day,
          groupKey,
          groupLabel: r.label,
          sessions: r.sessions.size,
          conversations: r.conversations.size,
          meetings: r.meetings.size,
        });
      }
    }

    out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    return out;
  },
});


export const signals = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
  },
  handler: async (ctx, args) => {
    const organizationId = await requireDashboardOrgId(ctx, args.organizationId);
    await requireAdvancedAnalytics(ctx, organizationId);
    const { fromTs, toTs } = args;

    const evts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q: any) =>
        q.eq("organizationId", organizationId).gte("ts", fromTs).lte("ts", toTs),
      )
      .collect();

    const { ccToTerr } = await buildCountryToTerritoryMap(ctx, organizationId);

    function emailDomain(email?: string) {
      if (!email || typeof email !== "string") return undefined;
      const at = email.indexOf("@");
      if (at <= 0) return undefined;
      return email.slice(at + 1).trim().toLowerCase();
    }

    function emailDomainFromMeta(meta: any) {
      return emailDomain(
        safeString(meta?.sessionEmail) ||
          safeString(meta?.attendeeEmail) ||
          safeString(meta?.email),
      );
    }

    /**
     * One event can attribute to multiple rows (e.g. company + work email domain) so
     * "Email domains" stays useful even when booking always sends a company name.
     */
    function accountKeysForEvent(e: any): Array<{ key: string; label: string }> {
      const meta = e?.meta ?? {};
      const direct = safeString(e?.accountId) || safeString(meta?.accountId);
      if (direct) return [{ key: `account:${direct}`, label: direct }];

      const company =
        safeString(meta?.company) ||
        safeString(meta?.account) ||
        safeString(meta?.attendeeCompany);
      const dom = emailDomainFromMeta(meta);

      const out: Array<{ key: string; label: string }> = [];
      if (company) {
        out.push({ key: `company:${company.toLowerCase()}`, label: company });
      }
      if (dom) {
        const dk = `emaildom:${dom}`;
        if (!out.some((o) => o.key === dk)) out.push({ key: dk, label: dom });
      }
      if (out.length) return out;

      const vid = safeString(meta?.visitorId);
      if (vid) return [{ key: `visitor:${vid}`, label: `Visitor ${vid.slice(0, 6)}` }];

      return [{ key: "unknown", label: "Unknown" }];
    }

    // Aggregations
    const agg = new Map<
      string,
      {
        label: string;
        sessions: Set<string>;
        conversations: Set<string>;
        meetings: Set<string>;
        experiences: number;
        inboundRequests: number;
        lastSeenTs: number;
        sources: Map<string, number>;
        territories: Map<string, number>;
        pages: Map<string, number>;
        companySources: Set<string>;
        conversationIds: Set<string>;
      }
    >();

    const ensure = (key: string, label: string) => {
      let r = agg.get(key);
      if (!r) {
        r = {
          label,
          sessions: new Set(),
          conversations: new Set(),
          meetings: new Set(),
          experiences: 0,
          inboundRequests: 0,
          lastSeenTs: 0,
          sources: new Map(),
          territories: new Map(),
          pages: new Map(),
          companySources: new Set(),
          conversationIds: new Set(),
        };
        agg.set(key, r);
      }
      return r;
    };

    const bump = (m: Map<string, number>, k?: string) => {
      if (!k) return;
      m.set(k, (m.get(k) ?? 0) + 1);
    };

    const dailyByGroup = new Map<string, Map<string, number>>();
    const bumpDayScore = (key: string, ts: number, delta: number) => {
      if (!delta || !ts) return;
      const day = dayKeyUTC(ts);
      let dm = dailyByGroup.get(key);
      if (!dm) {
        dm = new Map();
        dailyByGroup.set(key, dm);
      }
      dm.set(day, (dm.get(day) ?? 0) + delta);
    };

    function eventDayWeight(type: string) {
      switch (type) {
        case "meeting_booked":
          return 50;
        case "conversation_created":
          return 15;
        case "inbound_chat_requested":
          return 8;
        case "session_started":
          return 3;
        case "experience_shown":
          return 1;
        default:
          return 0;
      }
    }

    function dayKeysInRange(from: number, to: number, maxDays: number) {
      const out: string[] = [];
      const start = new Date(from);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(to);
      end.setUTCHours(0, 0, 0, 0);
      for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
        out.push(dayKeyUTC(t));
        if (out.length > 400) break;
      }
      if (out.length > maxDays) return out.slice(-maxDays);
      return out;
    }

    const sparkDays = dayKeysInRange(fromTs, toTs, 30);

    for (const e of evts) {
      const meta = e?.meta ?? {};
      const ts = safeNumber(e.ts, 0);
      const sk = getSessionKey(e);
      const ck = getConversationKey(e);
      const mk = e.type === "meeting_booked" ? getMeetingKey(e) : null;
      const w = eventDayWeight(String(e.type ?? ""));
      const t = getTerritoryForEvent(e, ccToTerr);

      for (const { key, label } of accountKeysForEvent(e)) {
        const r = ensure(key, label);

        if (ts) r.lastSeenTs = Math.max(r.lastSeenTs, ts);

        bumpDayScore(key, ts, w);

        if (sk) r.sessions.add(sk);

        if (ck && e.type === "conversation_created") {
          r.conversations.add(ck);
          if (e.conversationId) r.conversationIds.add(String(e.conversationId));
        }

        if (e.type === "meeting_booked" && mk) {
          r.meetings.add(mk);
          if (e.conversationId) r.conversationIds.add(String(e.conversationId));
        }

        if (e.type === "experience_shown") r.experiences += 1;
        if (e.type === "inbound_chat_requested") r.inboundRequests += 1;

        const src = normalizeSource(meta);
        if (!isNoiseSourceKey(src)) bump(r.sources, src);
        bump(r.pages, normalizePage(meta));

        const cs = safeString(meta?.companySource);
        if (cs === "declared" || cs === "ip") r.companySources.add(cs);

        bump(r.territories, t?.territoryLabel ?? "Unknown");
      }
    }

    const pickTop = (m: Map<string, number>) => {
      const arr = [...m.entries()].sort((a, b) => b[1] - a[1]);
      const top = arr[0];
      return top ? top[0] : undefined;
    };


    const pickTopN = (m: Map<string, number>, n = 3) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([k]) => k);

    // scoring (simple mais “wow”)
    // meetings >> conversations >> inbound >> sessions >> experiences
    function scoreOf(r: any) {
      return (
        r.meetings.size * 50 +
        r.conversations.size * 15 +
        safeNumber(r.inboundRequests, 0) * 8 +
        r.sessions.size * 3 +
        safeNumber(r.experiences, 0) * 1
      );
    }

    function tierOf(score: number) {
      if (score >= 120) return "Hot";
      if (score >= 45) return "Warm";
      return "Neutral";
    }

    function intentOf(score: number) {
      if (score >= 120) return "High";
      if (score >= 45) return "Medium";
      return "Low";
    }

    type IdentityKind = "account" | "company" | "domain" | "visitor" | "unknown";

    function identityKindFromGroupKey(groupKey: string): IdentityKind {
      if (groupKey === "unknown") return "unknown";
      if (groupKey.startsWith("account:")) return "account";
      if (groupKey.startsWith("company:")) return "company";
      if (groupKey.startsWith("emaildom:")) return "domain";
      if (groupKey.startsWith("visitor:")) return "visitor";
      return "unknown";
    }

    const rows = [...agg.entries()].map(([groupKey, r]) => {
      const score = scoreOf(r);
      const tier = tierOf(score);
      const intent = intentOf(score);

      const territory = pickTop(r.territories);
      const source = pickTop(r.sources);
      const topPages = pickTopN(r.pages, 3);

      const reasons: string[] = [];
      if (r.meetings.size > 0) reasons.push(`${r.meetings.size} meeting(s) booked`);
      if (r.conversations.size > 0) reasons.push(`${r.conversations.size} conversation(s)`);
      if (r.inboundRequests > 0) reasons.push(`${r.inboundRequests} inbound request(s)`);
      if (topPages?.length) reasons.push(`Top page: ${topPages[0]}`);

      const identityKind = identityKindFromGroupKey(groupKey);
      const companyName = identityKind === "company" ? r.label : undefined;
      const workDomain = identityKind === "domain" ? r.label : undefined;

      let companySource: "declared" | "ip" | "mixed" | undefined;
      if (r.companySources.has("declared") && r.companySources.has("ip")) companySource = "mixed";
      else if (r.companySources.has("declared")) companySource = "declared";
      else if (r.companySources.has("ip")) companySource = "ip";

      const dm = dailyByGroup.get(groupKey);
      const sparkline = sparkDays.map((d) => Math.round(dm?.get(d) ?? 0));

      return {
        groupKey,
        identityKind,
        account: r.label,
        companyName,
        workDomain,
        companySource,
        tier,
        intent,
        score,
        sessions: r.sessions.size,
        conversations: r.conversations.size,
        meetings: r.meetings.size,
        inboundRequests: r.inboundRequests,
        experiences: r.experiences,
        territory,
        source,
        topPages,
        reasons: reasons.slice(0, 4),
        lastSeenTs: r.lastSeenTs || undefined,
        sparkline,
        conversationIds: [...r.conversationIds].slice(0, 12),
      };
    });

    rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return rows.slice(0, 200);
  },
});

export const trends = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
  },
  handler: async (ctx, args) => {
    const organizationId = await requireDashboardOrgId(ctx, args.organizationId);
    const { fromTs, toTs } = args;

    const evts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q: any) =>
        q.eq("organizationId", organizationId).gte("ts", fromTs).lte("ts", toTs),
      )
      .collect();

    const byDay = new Map<
      string,
      {
        day: string;
        sessions: Set<string>;
        conversations: Set<string>;
        meetings: Set<string>;
        inboundRequests: number;
        experiences: number;
      }
    >();

    const ensure = (day: string) => {
      let r = byDay.get(day);
      if (!r) {
        r = {
          day,
          sessions: new Set(),
          conversations: new Set(),
          meetings: new Set(),
          inboundRequests: 0,
          experiences: 0,
        };
        byDay.set(day, r);
      }
      return r;
    };

    for (const e of evts) {
      const ts = safeNumber(e.ts, 0);
      if (!ts) continue;

      const day = dayKeyUTC(ts);
      const r = ensure(day);

      const sk = getSessionKey(e);
      if (sk) r.sessions.add(sk);

      const ck = getConversationKey(e);
      if (ck && e.type === "conversation_created") r.conversations.add(ck);

      if (e.type === "meeting_booked") {
        const mk = getMeetingKey(e);
        if (mk) r.meetings.add(mk);
      }

      if (e.type === "inbound_chat_requested") r.inboundRequests += 1;
      if (e.type === "experience_shown") r.experiences += 1;
    }

    const out = [...byDay.values()]
      .map((r) => ({
        day: r.day,
        sessions: r.sessions.size,
        conversations: r.conversations.size,
        meetings: r.meetings.size,
        inboundRequests: r.inboundRequests,
        experiences: r.experiences,
      }))
      .sort((a, b) => (a.day < b.day ? -1 : 1));

    return out;
  },
});

export const repsLeaderboard = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
    slaSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const organizationId = await requireDashboardOrgId(ctx, args.organizationId);
    await requireAdvancedAnalytics(ctx, organizationId);
    const { fromTs, toTs, slaSeconds } = args;

    const evts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q: any) =>
        q.eq("organizationId", organizationId).gte("ts", fromTs).lte("ts", toTs),
      )
      .collect();

    // userId = rep user (quand dispo). On agrège rep_started & meetings.
    const reps = new Map<
      string,
      {
        repUserId: string;
        rep_started: number;
        meetings: number;
      }
    >();

    const ensure = (repUserId: string) => {
      let r = reps.get(repUserId);
      if (!r) {
        r = { repUserId, rep_started: 0, meetings: 0 };
        reps.set(repUserId, r);
      }
      return r;
    };

    for (const e of evts) {
      const repUserId = safeString(e.userId);
      if (!repUserId) continue;

      if (e.type === "inbound_rep_started") {
        ensure(repUserId).rep_started += 1;
      }
      if (e.type === "meeting_booked") {
        ensure(repUserId).meetings += 1;
      }
    }

    // SLA metrics global (on peut faire per-rep plus tard)
    const inboundStats = computeFirstResponseStats(evts, slaSeconds);

    // enrich with Convex users table
    const rows = [];
    for (const r of reps.values()) {
      const u = await ctx.db
        .query("users")
        .withIndex("by_org_external", (q: any) =>
          q.eq("organizationId", organizationId).eq("externalId", r.repUserId),
        )
        .unique();

      rows.push({
        repUserId: r.repUserId,
        name: u?.name ?? "Rep",
        avatarUrl: u?.avatarUrl ?? undefined,
        title: u?.title ?? undefined,
        rep_started: r.rep_started,
        meetings: r.meetings,
      });
    }

    rows.sort((a, b) => (b.meetings - a.meetings) || (b.rep_started - a.rep_started));

    return {
      inboundStats,
      reps: rows.slice(0, 10),
    };
  },
});
