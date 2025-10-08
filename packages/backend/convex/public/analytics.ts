import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

/** --------- Events logging ---------- */
export const log = mutation({
  args: {
    organizationId: v.string(),
    type: v.string(), // "session_started" | "experience_shown" | "conversation_created" | "meeting_booked" | ...
    ts: v.optional(v.number()),
    userId: v.optional(v.string()),
    sessionId: v.optional(v.id("contactSessions")),
    conversationId: v.optional(v.id("conversations")),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("analyticsEvents", {
      organizationId: args.organizationId,
      type: args.type,
      ts: args.ts ?? Date.now(),
      userId: args.userId,
      sessionId: args.sessionId,
      conversationId: args.conversationId,
      meta: args.meta,
    });
    return { ok: true };
  },
});

/** --------- Overview counters ---------- */
export const overview = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
  },
  handler: async (ctx, { organizationId, fromTs, toTs }) => {
    const evts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q) =>
        q.eq("organizationId", organizationId).gte("ts", fromTs).lte("ts", toTs)
      )
      .collect();

    const count = (t: string) => evts.filter((e) => e.type === t).length;

    // Sessions = sessions uniques par contactSessionId
    const sessions = new Set(
      evts.filter((e) => e.type === "session_started").map((e) => e.sessionId)
    ).size;

    return {
      sessions,
      experiences: count("experience_shown"),
      inbound_requests: count("inbound_chat_requested"),
      pounce_attempts: count("pounce_attempt"),
      conversations: count("conversation_created"),
      meetings: count("meeting_booked"),
    };
  },
});

/** --------- Funnels (4 graphiques) ---------- */
export const funnels = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
    slaSeconds: v.optional(v.number()), // optionnel si tu veux un SLA
  },
  handler: async (ctx, { organizationId, fromTs, toTs }) => {
    const evts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q) =>
        q.eq("organizationId", organizationId).gte("ts", fromTs).lte("ts", toTs)
      )
      .collect();

    const count = (t: string) => evts.filter((e) => e.type === t).length;

    // Engagement
    const engagement = {
      sessions: new Set(
        evts.filter((e) => e.type === "session_started").map((e) => e.sessionId)
      ).size,
      experiences: count("experience_shown"),
      conversations: count("conversation_created"),
      meetings: count("meeting_booked"),
    };

    // Conversion (on renvoie num/den; l’UI calcule les %)
    const conversion = {
      meetings_from_conversations_num: engagement.meetings,
      meetings_from_conversations_den: Math.max(engagement.conversations, 1),
      conversations_from_experiences_num: engagement.conversations,
      conversations_from_experiences_den: Math.max(engagement.experiences, 1),
    };

    // Inbound Chat Health
    const inbound = {
      requests: count("inbound_chat_requested"),
      with_rep_available: count("inbound_rep_available"),
      rep_started: count("inbound_rep_started"),
      started_before_sla: count("inbound_started_before_sla"),
    };

    // Pounce Conversation Rate
    const pounce = {
      attempts: count("pounce_attempt"),
      conversations: count("pounce_conversation"),
      meetings: count("pounce_meeting"),
    };

    return { engagement, conversion, inbound, pounce };
  },
});

/** --------- Signals list (simple v1) ---------- */
export const signals = query({
  args: {
    organizationId: v.string(),
    fromTs: v.number(),
    toTs: v.number(),
  },
  handler: async (ctx, { organizationId, fromTs, toTs }) => {
    const evts = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_org_ts", (q) =>
        q.eq("organizationId", organizationId).gte("ts", fromTs).lte("ts", toTs)
      )
      .collect();

    const byAccount = new Map<
      string,
      { sessions: number; timeOnSiteMs: number; engagement: "Neutral" | "On Fire" }
    >();

    for (const e of evts) {
      const account =
        (e.meta?.account as string) ||
        (e.meta?.company as string) ||
        (e.meta?.domain as string) ||
        "Unknown";

      let row = byAccount.get(account);
      if (!row) {
        row = { sessions: 0, timeOnSiteMs: 0, engagement: "Neutral" };
        byAccount.set(account, row);
      }
      if (e.type === "session_started") row.sessions += 1;
      if (e.type === "time_on_site") row.timeOnSiteMs += Number(e.meta?.ms ?? 0);
      if (e.type === "experience_shown" || e.type === "conversation_created") {
        row.engagement = "On Fire";
      }
    }

    const rows = [...byAccount.entries()].map(([account, r]) => ({
      account,
      engagement: r.engagement,
      timeOnSite: r.timeOnSiteMs
        ? `${Math.round(r.timeOnSiteMs / 3600000)}h ${Math.round(
            (r.timeOnSiteMs % 3600000) / 60000
          )}m`
        : "—",
      sessions: r.sessions,
    }));

    return rows.sort((a, b) => b.sessions - a.sessions).slice(0, 50);
  },
});
