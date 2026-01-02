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
    // geo
    city: safeString(m.city),
    countryCode: safeString(m.countryCode),
    lat: typeof m.lat === "number" ? m.lat : undefined,
    lng: typeof m.lng === "number" ? m.lng : undefined,

    // browsing context
    currentUrl,
    referrer: safeString(m.referrer),
    title: safeString(m.title),

    // visitor identifiers
    visitorId: safeString(m.visitorId),

    // utm
    ...pickUtm(currentUrl),
  };
}

/**
 * Session key stable pour dédup:
 * - sessionId -> best
 * - visitorId -> fallback
 * - conversationId -> fallback
 */
function getSessionKey(e: any): string | null {
  if (e.sessionId) return `session:${String(e.sessionId)}`;
  const visitorId = e?.meta?.visitorId;
  if (visitorId) return `visitor:${String(visitorId)}`;
  if (e.conversationId) return `conv:${String(e.conversationId)}`;
  return null;
}

/**
 * Conversation key stable
 */
function getConversationKey(e: any): string | null {
  if (e.conversationId) return `conv:${String(e.conversationId)}`;
  return null;
}

/**
 * Dédup: meeting_booked
 */
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
  if (!sortedNums.length) return null;
  const mid = Math.floor(sortedNums.length / 2);
  if (sortedNums.length % 2 === 0) return (sortedNums[mid - 1] + sortedNums[mid]) / 2;
  return sortedNums[mid];
}

function rate(num: number, den: number) {
  if (!den || den <= 0) return 0;
  return num / den;
}

function deltaPct(current: number, previous: number) {
  if (!previous) return current ? 1 : 0; // if previous=0, treat as 100%+ when current>0
  return (current - previous) / previous;
}

function clampTopK<T>(arr: T[], k = 8) {
  return arr.slice(0, Math.max(0, k));
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
   Internal aggregation helpers (Executive-grade)
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

/**
 * Response time model:
 * - start: inbound_chat_requested (best) else conversation_created
 * - first rep: inbound_rep_started (must be logged once per conversation)
 */
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
    // keep only path, drop query to avoid explosion
    return u.pathname || "/";
  } catch {
    return url.slice(0, 200);
  }
}

function intentFromPages(pages: string[]) {
  const s = pages.join(" ").toLowerCase();
  if (s.includes("pricing") || s.includes("demo") || s.includes("book") || s.includes("calendar"))
    return "High" as const;
  if (s.includes("docs") || s.includes("security") || s.includes("compliance") || s.includes("integration"))
    return "Medium" as const;
  return "Low" as const;
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

    // security guard (optional): ensure same org
    if (hit && hit.organizationId !== organizationId) return false;

    return !!hit;
  },
});


/* ============================================================
   Executive Overview ++++ (C-level)
   - KPIs + conversion + SLA + attribution + territories + deltas
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

    // Previous period (same duration) for deltas
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

    // Attribution: sources -> events + conversions
    // We attribute a conversation/meeting to the first source seen in that conversation/session window.
    const sourceAgg = new Map<
      string,
      {
        sessions: Set<string>;
        conversations: Set<string>;
        meetings: Set<string>;
        inboundRequests: number;
        experiences: number;
      }
    >();

    const ensureSource = (src: string) => {
      let r = sourceAgg.get(src);
      if (!r) {
        r = {
          sessions: new Set(),
          conversations: new Set(),
          meetings: new Set(),
          inboundRequests: 0,
          experiences: 0,
        };
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
      if (e.type === "inbound_chat_requested") r.inboundRequests += 1;
      if (e.type === "experience_shown") r.experiences += 1;
    }

    const top_sources = [...sourceAgg.entries()]
      .map(([source, r]) => ({
        source,
        sessions: r.sessions.size,
        experiences: r.experiences,
        inboundRequests: r.inboundRequests,
        conversations: r.conversations.size,
        meetings: r.meetings.size,
        conv_rate_from_sessions: rate(r.conversations.size, Math.max(r.sessions.size, 1)),
        meeting_rate_from_conversations: rate(r.meetings.size, Math.max(r.conversations.size, 1)),
      }))
      .sort((a, b) => b.meetings - a.meetings || b.conversations - a.conversations || b.sessions - a.sessions);

    // Territories leaderboard
    const { ccToTerr } = await buildCountryToTerritoryMap(ctx, organizationId);

    const terrAgg = new Map<
      string,
      {
        label: string;
        sessions: Set<string>;
        conversations: Set<string>;
        meetings: Set<string>;
        inboundRequests: number;
        experiences: number;
      }
    >();

    const ensureTerr = (key: string, label: string) => {
      let r = terrAgg.get(key);
      if (!r) {
        r = {
          label,
          sessions: new Set(),
          conversations: new Set(),
          meetings: new Set(),
          inboundRequests: 0,
          experiences: 0,
        };
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

      if (e.type === "inbound_chat_requested") r.inboundRequests += 1;
      if (e.type === "experience_shown") r.experiences += 1;
    }

    const top_territories = [...terrAgg.entries()]
      .map(([territoryKey, r]) => ({
        territoryKey,
        territoryLabel: r.label,
        sessions: r.sessions.size,
        experiences: r.experiences,
        inboundRequests: r.inboundRequests,
        conversations: r.conversations.size,
        meetings: r.meetings.size,
        conv_rate_from_sessions: rate(r.conversations.size, Math.max(r.sessions.size, 1)),
        meeting_rate_from_conversations: rate(r.meetings.size, Math.max(r.conversations.size, 1)),
      }))
      .sort((a, b) => b.meetings - a.meetings || b.conversations - a.conversations || b.sessions - a.sessions);

    // Top pages (path-only) to show what drives engagement
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
        conv_rate: rate(r.conversations.size, Math.max(r.sessions.size, 1)),
      }))
      .sort((a, b) => b.meetings - a.meetings || b.conversations - a.conversations || b.sessions - a.sessions)
      .slice(0, 8);

    // Executive KPIs + deltas
    const kpi = {
      sessions,
      experiences,
      inboundRequests,
      conversations,
      meetings,
    };

    const deltas = {
      sessions: deltaPct(sessions, prevSessions),
      experiences: deltaPct(experiences, prevExperiences),
      inboundRequests: deltaPct(inboundRequests, prevInboundRequests),
      conversations: deltaPct(conversations, prevConversations),
      meetings: deltaPct(meetings, prevMeetings),
    };

    const conversion = {
      experience_to_conversation: rate(conversations, Math.max(experiences, 1)),
      inbound_to_conversation: rate(conversations, Math.max(inboundRequests, 1)),
      conversation_to_meeting: rate(meetings, Math.max(conversations, 1)),
      session_to_meeting: rate(meetings, Math.max(sessions, 1)),
    };

    // Pounce basic
    const pounce = {
      attempts: evts.filter((e) => e.type === "pounce_attempt").length,
      conversations: evts.filter((e) => e.type === "pounce_conversation").length,
      meetings: evts.filter((e) => e.type === "pounce_meeting").length,
    };

    return {
      period: { fromTs, toTs, durationMs: duration },
      kpi,
      deltas,
      conversion,
      inbound_response,
      pounce,
      top_sources: clampTopK(top_sources, 8),
      top_territories: clampTopK(top_territories, 8),
      top_pages,
    };
  },
});

/* ============================================================
   Funnels ++++ (Board-ready)
   - Funnel + conversion + SLA + breakdown by source & territory
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
    const inboundRequests = evts.filter((e) => e.type === "inbound_chat_requested").length;
    const conversations = computeConversationsUnique(evts);
    const meetings = computeMeetingsUnique(evts);

    const inbound_ops = computeFirstResponseStats(evts, slaSeconds);

    const funnel = [
      { step: "Sessions", value: sessions },
      { step: "Experience shown", value: experiences },
      { step: "Inbound requests", value: inboundRequests },
      { step: "Conversations", value: conversations },
      { step: "Meetings", value: meetings },
    ];

    const conversion = {
      experience_to_conversation: rate(conversations, Math.max(experiences, 1)),
      inbound_to_conversation: rate(conversations, Math.max(inboundRequests, 1)),
      conversation_to_meeting: rate(meetings, Math.max(conversations, 1)),
      session_to_meeting: rate(meetings, Math.max(sessions, 1)),
    };

    // Breakdown by source (compact)
    const sourceAgg = new Map<string, { sessions: Set<string>; conversations: Set<string>; meetings: Set<string> }>();
    const ensureSource = (s: string) => {
      let r = sourceAgg.get(s);
      if (!r) {
        r = { sessions: new Set(), conversations: new Set(), meetings: new Set() };
        sourceAgg.set(s, r);
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

    const by_source = [...sourceAgg.entries()]
      .map(([source, r]) => ({
        source,
        sessions: r.sessions.size,
        conversations: r.conversations.size,
        meetings: r.meetings.size,
        conv_rate: rate(r.conversations.size, Math.max(r.sessions.size, 1)),
        meeting_rate: rate(r.meetings.size, Math.max(r.conversations.size, 1)),
      }))
      .sort((a, b) => b.meetings - a.meetings || b.conversations - a.conversations || b.sessions - a.sessions)
      .slice(0, 10);

    // Breakdown by territory (compact)
    const { ccToTerr } = await buildCountryToTerritoryMap(ctx, organizationId);
    const terrAgg = new Map<string, { label: string; sessions: Set<string>; conversations: Set<string>; meetings: Set<string> }>();

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

    const by_territory = [...terrAgg.entries()]
      .map(([territoryKey, r]) => ({
        territoryKey,
        territoryLabel: r.label,
        sessions: r.sessions.size,
        conversations: r.conversations.size,
        meetings: r.meetings.size,
        conv_rate: rate(r.conversations.size, Math.max(r.sessions.size, 1)),
        meeting_rate: rate(r.meetings.size, Math.max(r.conversations.size, 1)),
      }))
      .sort((a, b) => b.meetings - a.meetings || b.conversations - a.conversations || b.sessions - a.sessions)
      .slice(0, 10);

    // Pounce
    const pounce = {
      attempts: evts.filter((e) => e.type === "pounce_attempt").length,
      conversations: evts.filter((e) => e.type === "pounce_conversation").length,
      meetings: evts.filter((e) => e.type === "pounce_meeting").length,
    };

    return { funnel, conversion, inbound_ops, by_source, by_territory, pounce };
  },
});

/* ============================================================
   Signals ++++ (Executive “Accounts to watch”)
   - Score + Intent + Reasons + Attribution + Territory
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

    type Acc = {
      account: string;
      sessions: Set<string>;
      conversations: Set<string>;
      meetings: Set<string>;
      inboundRequests: number;
      experiences: number;
      lastSeenTs: number;

      source?: string;
      territoryKey?: string;
      territoryLabel?: string;
      countryCode?: string;
      city?: string;

      pages: Map<string, number>;
    };

    const byAccount = new Map<string, Acc>();

    const getAccount = (meta: any) =>
      safeString(meta.account) ||
      safeString(meta.company) ||
      safeString(meta.domain) ||
      "Unknown";

    const ensure = (account: string) => {
      let r = byAccount.get(account);
      if (!r) {
        r = {
          account,
          sessions: new Set(),
          conversations: new Set(),
          meetings: new Set(),
          inboundRequests: 0,
          experiences: 0,
          lastSeenTs: 0,
          pages: new Map(),
        };
        byAccount.set(account, r);
      }
      return r;
    };

    for (const e of evts) {
      const meta = e.meta ?? {};
      const account = getAccount(meta);
      const r = ensure(account);

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

      r.lastSeenTs = Math.max(r.lastSeenTs, safeNumber(e.ts, 0));

      // attribution (best-effort): keep first non-direct source
      const src = normalizeSource(meta);
      if (!r.source || (r.source === "direct" && src !== "direct")) r.source = src;

      const t = getTerritoryForEvent(e, ccToTerr);
      r.territoryKey = t.territoryKey;
      r.territoryLabel = t.territoryLabel;

      const cc = safeString(meta.countryCode);
      const city = safeString(meta.city);
      if (cc) r.countryCode = cc;
      if (city) r.city = city;

      const page = normalizePage(meta);
      if (page) r.pages.set(page, (r.pages.get(page) ?? 0) + 1);
    }

    // Executive scoring model (simple, explainable)
    // - meetings dominate
    // - conversations strong
    // - inboundRequests show intent
    // - sessions show volume
    const rows = [...byAccount.values()].map((r) => {
      const sessions = r.sessions.size;
      const conversations = r.conversations.size;
      const meetings = r.meetings.size;

      const score =
        sessions * 1 +
        conversations * 4 +
        meetings * 10 +
        r.inboundRequests * 2 +
        r.experiences * 1;

      const topPages = [...r.pages.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([p]) => p);

      const intent = intentFromPages(topPages);

      let tier: "Hot" | "Warm" | "Neutral" = "Neutral";
      if (meetings > 0 || score >= 18) tier = "Hot";
      else if (score >= 8) tier = "Warm";

      // Reasons (explainability for execs)
      const reasons: string[] = [];
      if (meetings > 0) reasons.push("Meeting booked");
      if (conversations > 0) reasons.push("Conversation created");
      if (r.inboundRequests > 0) reasons.push("Inbound request(s)");
      if (intent === "High") reasons.push("High-intent page visited");
      if (sessions >= 3) reasons.push("Multiple sessions");

      return {
        account: r.account,
        tier,
        score,
        intent,

        sessions,
        conversations,
        meetings,
        inboundRequests: r.inboundRequests,
        experiences: r.experiences,

        source: r.source ?? "direct",
        territory: r.territoryLabel ?? "Unknown",
        territoryKey: r.territoryKey ?? "unknown",
        countryCode: r.countryCode ?? "—",
        city: r.city ?? "—",

        topPages,
        reasons: reasons.slice(0, 5),
        lastSeenTs: r.lastSeenTs,
      };
    });

    // Hot first, then score desc
    rows.sort((a, b) => {
      const tierRank = (t: string) => (t === "Hot" ? 2 : t === "Warm" ? 1 : 0);
      return tierRank(b.tier) - tierRank(a.tier) || b.score - a.score;
    });

    return rows.slice(0, 50);
  },
});
