// packages/backend/convex/public/analytics.ts
import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

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

  return {
    // identity-ish
    sessionName: safeString(session?.name),
    sessionEmail: safeString(session?.email),

    // geo
    city: safeString(m.city),
    countryCode: safeString(m.countryCode),
    lat: typeof m.lat === "number" ? m.lat : undefined,
    lng: typeof m.lng === "number" ? m.lng : undefined,

    // page
    currentUrl,
    referrer: safeString(m.referrer),
    title: safeString(m.title),

    // tracking
    visitorId: safeString(m.visitorId),

    ...pickUtm(currentUrl),
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

  // odd
  if (n % 2 === 1) {
    const v = sortedNums[mid];
    return typeof v === "number" ? v : null;
  }

  // even
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

function dayKeyUTC(ts: number) {
  // YYYY-MM-DD (UTC)
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
  const s = safeString(meta?.utm_source);
  if (s) return s;
  const ref = safeString(meta?.referrer);
  if (!ref) return "direct";
  try {
    const u = new URL(ref);
    const host = u.hostname.replace(/^www\./, "");
    return host || "referral";
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
   (Ton front Overview page consomme ça)
   ============================================================ */

export const overview = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
    slaSeconds: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, fromTs, toTs, slaSeconds }) => {
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
    const experiences = evts.filter((e) => e.type === "experience_shown").length;
    const inboundRequests = evts.filter((e) => e.type === "inbound_chat_requested").length;
    const conversations = computeConversationsUnique(evts);
    const meetings = computeMeetingsUnique(evts);

    const prevSessions = computeSessionsRobust(prevEvts);
    const prevExperiences = prevEvts.filter((e) => e.type === "experience_shown").length;
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
      .sort((a, b) => b.meetings - a.meetings || b.conversations - a.conversations || b.sessions - a.sessions);

    // Territories
    const { ccToTerr } = await buildCountryToTerritoryMap(ctx, organizationId);

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
      .sort((a, b) => b.meetings - a.meetings || b.conversations - a.conversations || b.sessions - a.sessions);

    // Top pages
    const pageAgg = new Map<string, { sessions: Set<string>; conversations: Set<string>; meetings: Set<string> }>();
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
      .sort((a, b) => b.meetings - a.meetings || b.conversations - a.conversations || b.sessions - a.sessions)
      .slice(0, 8);

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
      top_sources: clampTopK(top_sources, 8),
      top_territories: clampTopK(top_territories, 8),
      top_pages,
    };
  },
});

/* ============================================================
   FUNNELS
   ⚠️ IMPORTANT: match le front actuel (engagement/conversion/inbound/pounce)
   ============================================================ */

export const funnels = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
    slaSeconds: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, fromTs, toTs, slaSeconds }) => {
    const evts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q: any) =>
        q.eq("organizationId", organizationId).gte("ts", fromTs).lte("ts", toTs),
      )
      .collect();

    const sessions = computeSessionsRobust(evts);
    const experiences = evts.filter((e) => e.type === "experience_shown").length;
    const conversations = computeConversationsUnique(evts);
    const meetings = computeMeetingsUnique(evts);

    const inboundRequests = evts.filter((e) => e.type === "inbound_chat_requested").length;

    // Rep started = unique conv where inbound_rep_started exists
    const repStartedUnique = uniqueCount(
      evts.filter((e) => e.type === "inbound_rep_started").map(getConversationKey),
    );

    // Started < SLA
    const inboundStats = computeFirstResponseStats(evts, slaSeconds);
    // within_sla_rate * conversations_with_rep => count
    const startedBeforeSla =
      typeof inboundStats.within_sla_rate === "number" && inboundStats.conversations_with_rep
        ? Math.round(inboundStats.within_sla_rate * inboundStats.conversations_with_rep)
        : 0;

    // ✅ Return exactly what ton UI attend
    const engagement = { sessions, experiences, conversations, meetings };

    const conversion = {
      meetings_from_conversations_num: meetings,
      meetings_from_conversations_den: conversations,
      conversations_from_experiences_num: conversations,
      conversations_from_experiences_den: experiences,
    };

    const inbound = {
      requests: inboundRequests,
      with_rep_available: 0, // (tu peux logger un event dédié plus tard)
      rep_started: repStartedUnique,
      started_before_sla: startedBeforeSla,
    };

    const pounce = {
      attempts: evts.filter((e) => e.type === "pounce_attempt").length,
      conversations: evts.filter((e) => e.type === "pounce_conversation").length,
      meetings: evts.filter((e) => e.type === "pounce_meeting").length,
    };

    return { engagement, conversion, inbound, pounce };
  },
});

/* ============================================================
   territoryBreakdown (pour arrêter le 404)
   ============================================================ */

export const territoryBreakdown = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
  },
  handler: async (ctx, { organizationId, fromTs, toTs }) => {
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
   timeseries (pour arrêter le 404)
   - supporte groupBy="territory" (ton UI multi-lines)
   ============================================================ */

export const timeseries = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
    groupBy: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, fromTs, toTs, groupBy }) => {
    const evts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q: any) =>
        q.eq("organizationId", organizationId).gte("ts", fromTs).lte("ts", toTs),
      )
      .collect();

    const gb = groupBy ?? "territory";
    const { ccToTerr } = await buildCountryToTerritoryMap(ctx, organizationId);

    // day -> groupKey -> sets
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

/* ============================================================
   signals (on le garde tel quel pour l’instant)
   ⚠️ ton UI actuelle "SignalsTable" ne match pas encore ce format
   ============================================================ */

export const signals = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
  },
  handler: async (ctx, { organizationId, fromTs, toTs }) => {
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

    function accountKeyForEvent(e: any) {
      const meta = e?.meta ?? {};
      const direct = safeString(e?.accountId) || safeString(meta?.accountId);
      if (direct) return { key: `account:${direct}`, label: direct };

      const company = safeString(meta?.company) || safeString(meta?.account);
      if (company) return { key: `company:${company.toLowerCase()}`, label: company };

      const dom = emailDomain(safeString(meta?.sessionEmail));
      if (dom) return { key: `emaildom:${dom}`, label: dom };

      const vid = safeString(meta?.visitorId);
      if (vid) return { key: `visitor:${vid}`, label: `Visitor ${vid.slice(0, 6)}` };

      return { key: "unknown", label: "Unknown" };
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
        };
        agg.set(key, r);
      }
      return r;
    };

    const bump = (m: Map<string, number>, k?: string) => {
      if (!k) return;
      m.set(k, (m.get(k) ?? 0) + 1);
    };

    for (const e of evts) {
      const meta = e?.meta ?? {};
      const { key, label } = accountKeyForEvent(e);
      const r = ensure(key, label);

      const ts = safeNumber(e.ts, 0);
      if (ts) r.lastSeenTs = Math.max(r.lastSeenTs, ts);

      const sk = getSessionKey(e);
      if (sk) r.sessions.add(sk);

      const ck = getConversationKey(e);
      if (ck && e.type === "conversation_created") r.conversations.add(ck);

      if (e.type === "meeting_booked") {
        const mk = getMeetingKey(e);
        if (mk) r.meetings.add(mk);
      }

      if (e.type === "experience_shown") r.experiences += 1;
      if (e.type === "inbound_chat_requested") r.inboundRequests += 1;

      // attribution
      bump(r.sources, normalizeSource(meta));
      bump(r.pages, normalizePage(meta));

      const t = getTerritoryForEvent(e, ccToTerr);
      bump(r.territories, t?.territoryLabel ?? "Unknown");
    }

    const pickTop = (m: Map<string, number>) => {
      const arr = [...m.entries()].sort((a, b) => b[1] - a[1]);
      return arr.length ? arr[0][0] : undefined;
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

    const rows = [...agg.values()].map((r) => {
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

      return {
        account: r.label,
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
  handler: async (ctx, { organizationId, fromTs, toTs }) => {
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
  handler: async (ctx, { organizationId, fromTs, toTs, slaSeconds }) => {
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
