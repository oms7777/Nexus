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
 * Détermine un "session key" stable.
 * - priorité: sessionId (contactSessionId)
 * - fallback: meta.visitorId
 * - fallback: conversationId
 */
function getSessionKey(e: any): string | null {
  if (e.sessionId) return `session:${String(e.sessionId)}`;
  const visitorId = e?.meta?.visitorId;
  if (visitorId) return `visitor:${String(visitorId)}`;
  if (e.conversationId) return `conv:${String(e.conversationId)}`;
  return null;
}

/**
 * Dédup: meeting_booked
 * - priorité: meta.bookingId si présent
 * - fallback: conversationId
 * - fallback: ts bucket (minute) + attendeeEmail
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

function dayKey(ts: number) {
  // UTC day key to keep consistent server-side charts
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ============================================================
   Territory helpers
   - map countryCode -> territory (via territories table)
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
      // first one wins to avoid conflicts
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
    // Enrich meta with session-derived context (geo/utm/etc.) when sessionId exists.
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

/* ============================================================
   Overview counters (V2)
   - sessions: robust fallback if session_started not logged
   - meetings: de-duplicated
   ============================================================ */

export const overview = query({
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

    const countRaw = (t: string) => evts.filter((e: any) => e.type === t).length;

    // sessions robustes
    const sessionStarted = evts.filter((e: any) => e.type === "session_started");
    const sessions =
      sessionStarted.length > 0
        ? uniqueCount(sessionStarted.map((e: any) => (e.sessionId ? String(e.sessionId) : null)))
        : uniqueCount(
            evts
              .filter((e: any) =>
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

    const meetingsUnique = uniqueCount(
      evts.filter((e: any) => e.type === "meeting_booked").map(getMeetingKey),
    );

    return {
      sessions,
      experiences: countRaw("experience_shown"),
      inbound_requests: countRaw("inbound_chat_requested"),
      pounce_attempts: countRaw("pounce_attempt"),
      conversations: countRaw("conversation_created"),
      meetings: meetingsUnique,
    };
  },
});

/* ============================================================
   Funnels (V2)
   - sessions robustes
   - meetings dédupliqués
   ============================================================ */

export const funnels = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
    slaSeconds: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, fromTs, toTs }) => {
    const evts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q: any) =>
        q.eq("organizationId", organizationId).gte("ts", fromTs).lte("ts", toTs),
      )
      .collect();

    const countRaw = (t: string) => evts.filter((e: any) => e.type === t).length;

    const sessionStarted = evts.filter((e: any) => e.type === "session_started");
    const sessions =
      sessionStarted.length > 0
        ? uniqueCount(sessionStarted.map((e: any) => (e.sessionId ? String(e.sessionId) : null)))
        : uniqueCount(
            evts
              .filter((e: any) =>
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

    const meetings = uniqueCount(
      evts.filter((e: any) => e.type === "meeting_booked").map(getMeetingKey),
    );

    const engagement = {
      sessions,
      experiences: countRaw("experience_shown"),
      conversations: countRaw("conversation_created"),
      meetings,
    };

    const conversion = {
      meetings_from_conversations_num: engagement.meetings,
      meetings_from_conversations_den: Math.max(engagement.conversations, 1),
      conversations_from_experiences_num: engagement.conversations,
      conversations_from_experiences_den: Math.max(engagement.experiences, 1),
    };

    const inbound = {
      requests: countRaw("inbound_chat_requested"),
      with_rep_available: countRaw("inbound_rep_available"),
      rep_started: countRaw("inbound_rep_started"),
      started_before_sla: countRaw("inbound_started_before_sla"),
    };

    const pounce = {
      attempts: countRaw("pounce_attempt"),
      conversations: countRaw("pounce_conversation"),
      meetings: countRaw("pounce_meeting"),
    };

    return { engagement, conversion, inbound, pounce };
  },
});

/* ============================================================
   NEW: Territory breakdown (for bar charts, tables, etc.)
   - sessions robustes (unique sessionKey)
   - meetings dédupliqués
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

    type Row = {
      territoryKey: string;
      territoryLabel: string;
      sessionKeys: Set<string>;
      experiences: number;
      conversations: number;
      inbound_requests: number;
      meetingsKeys: Set<string>;
    };

    const map = new Map<string, Row>();

    const ensureRow = (k: string, label: string) => {
      let r = map.get(k);
      if (!r) {
        r = {
          territoryKey: k,
          territoryLabel: label,
          sessionKeys: new Set(),
          experiences: 0,
          conversations: 0,
          inbound_requests: 0,
          meetingsKeys: new Set(),
        };
        map.set(k, r);
      }
      return r;
    };

    for (const e of evts) {
      const { territoryKey, territoryLabel } = getTerritoryForEvent(e, ccToTerr);
      const r = ensureRow(territoryKey, territoryLabel);

      const sk = getSessionKey(e);
      if (sk) r.sessionKeys.add(sk);

      if (e.type === "experience_shown") r.experiences += 1;
      if (e.type === "conversation_created") r.conversations += 1;
      if (e.type === "inbound_chat_requested") r.inbound_requests += 1;

      if (e.type === "meeting_booked") {
        const mk = getMeetingKey(e);
        if (mk) r.meetingsKeys.add(mk);
      }
    }

    const rows = [...map.values()].map((r) => ({
      territoryKey: r.territoryKey,
      territoryLabel: r.territoryLabel,
      sessions: r.sessionKeys.size,
      experiences: r.experiences,
      inbound_requests: r.inbound_requests,
      conversations: r.conversations,
      meetings: r.meetingsKeys.size,
    }));

    // sort: by sessions desc
    return rows.sort((a, b) => b.sessions - a.sessions);
  },
});

/* ============================================================
   NEW: Timeseries (for line/area charts)
   - groupBy "none" => 1 line per metric
   - groupBy "territory" => multi-line / stacked
   ============================================================ */

export const timeseries = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
    groupBy: v.optional(v.union(v.literal("none"), v.literal("territory"))),
  },
  handler: async (ctx, { organizationId, fromTs, toTs, groupBy }) => {
    const evts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q: any) =>
        q.eq("organizationId", organizationId).gte("ts", fromTs).lte("ts", toTs),
      )
      .collect();

    const mode = groupBy ?? "none";

    const { ccToTerr } =
      mode === "territory" ? await buildCountryToTerritoryMap(ctx, organizationId) : { ccToTerr: new Map() };

    type Bucket = {
      day: string;
      groupKey: string;   // "all" or territoryKey
      groupLabel: string; // "All" or territoryLabel
      sessionKeys: Set<string>;
      experiences: number;
      inbound_requests: number;
      conversations: number;
      meetingKeys: Set<string>;
    };

    const buckets = new Map<string, Bucket>();

    const getGroup = (e: any) => {
      if (mode !== "territory") return { key: "all", label: "All" };
      const t = getTerritoryForEvent(e, ccToTerr as any);
      return { key: t.territoryKey, label: t.territoryLabel };
    };

    const ensureBucket = (day: string, gk: string, gl: string) => {
      const id = `${day}::${gk}`;
      let b = buckets.get(id);
      if (!b) {
        b = {
          day,
          groupKey: gk,
          groupLabel: gl,
          sessionKeys: new Set(),
          experiences: 0,
          inbound_requests: 0,
          conversations: 0,
          meetingKeys: new Set(),
        };
        buckets.set(id, b);
      }
      return b;
    };

    for (const e of evts) {
      const d = dayKey(safeNumber(e.ts, Date.now()));
      const g = getGroup(e);
      const b = ensureBucket(d, g.key, g.label);

      const sk = getSessionKey(e);
      if (sk) b.sessionKeys.add(sk);

      if (e.type === "experience_shown") b.experiences += 1;
      if (e.type === "inbound_chat_requested") b.inbound_requests += 1;
      if (e.type === "conversation_created") b.conversations += 1;

      if (e.type === "meeting_booked") {
        const mk = getMeetingKey(e);
        if (mk) b.meetingKeys.add(mk);
      }
    }

    const rows = [...buckets.values()].map((b) => ({
      day: b.day,
      groupKey: b.groupKey,
      groupLabel: b.groupLabel,
      sessions: b.sessionKeys.size,
      experiences: b.experiences,
      inbound_requests: b.inbound_requests,
      conversations: b.conversations,
      meetings: b.meetingKeys.size,
    }));

    // sort by day asc then group
    rows.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.groupKey.localeCompare(b.groupKey)));

    return rows;
  },
});

/* ============================================================
   Signals (V2) — upgraded w/ territory
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

    const byAccount = new Map<
      string,
      {
        sessionsKeys: Set<string>;
        timeOnSiteMs: number;
        engagement: "Neutral" | "On Fire";
        countryCode?: string;
        city?: string;
        utm_source?: string;
        territoryKey?: string;
        territoryLabel?: string;
      }
    >();

    for (const e of evts) {
      const meta = e.meta ?? {};

      const account =
        safeString(meta.account) ||
        safeString(meta.company) ||
        safeString(meta.domain) ||
        "Unknown";

      let row = byAccount.get(account);
      if (!row) {
        row = { sessionsKeys: new Set(), timeOnSiteMs: 0, engagement: "Neutral" };
        byAccount.set(account, row);
      }

      const sk = getSessionKey(e);
      if (sk) row.sessionsKeys.add(sk);

      if (e.type === "time_on_site") {
        row.timeOnSiteMs += safeNumber(meta.ms, 0);
      }

      if (e.type === "experience_shown" || e.type === "conversation_created") {
        row.engagement = "On Fire";
      }

      const cc = safeString(meta.countryCode);
      const city = safeString(meta.city);
      if (cc) row.countryCode = cc;
      if (city) row.city = city;

      const utmSource = safeString(meta.utm_source);
      if (utmSource) row.utm_source = utmSource;

      const t = getTerritoryForEvent(e, ccToTerr);
      row.territoryKey = t.territoryKey;
      row.territoryLabel = t.territoryLabel;
    }

    const fmtTime = (ms: number) => {
      if (!ms) return "—";
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      if (!h && !m) return "<1m";
      if (!h) return `${m}m`;
      return `${h}h ${m}m`;
    };

    const rows = [...byAccount.entries()].map(([account, r]) => ({
      account,
      engagement: r.engagement,
      timeOnSite: fmtTime(r.timeOnSiteMs),
      sessions: r.sessionsKeys.size,
      countryCode: r.countryCode ?? "—",
      city: r.city ?? "—",
      utm_source: r.utm_source ?? "—",
      territory: r.territoryLabel ?? "Unknown",
      territoryKey: r.territoryKey ?? "unknown",
    }));

    return rows.sort((a, b) => b.sessions - a.sessions).slice(0, 50);
  },
});
