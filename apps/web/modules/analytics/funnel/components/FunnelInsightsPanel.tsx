"use client";

import React, { useMemo } from "react";
import { AlertTriangle, ArrowRight, TrendingDown } from "lucide-react";

function n(x: any) {
  const v = Number(x ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function pct(num: number, den: number) {
  if (den <= 0) return null;
  return Math.max(0, Math.min(1, num / den));
}

function fmtPct(p: number | null) {
  if (p === null) return "—";
  return `${Math.round(p * 100)}%`;
}

type Engagement = {
  sessions?: number;
  experiences?: number;
  conversations?: number;
  meetings?: number;
};

type Inbound = {
  requests?: number;
  rep_started?: number;
  booking_proposed?: number;
  meetings_booked?: number;
};

export function FunnelInsightsPanel({
  engagement,
  inbound,
}: {
  engagement: Engagement;
  inbound: Inbound | null;
}) {
  const insights = useMemo(() => {
    const sessions = n(engagement.sessions);
    const experiences = n(engagement.experiences);
    const conversations = n(engagement.conversations);
    const meetings = n(engagement.meetings);

    const exRate = pct(experiences, sessions);
    const convoRate = pct(conversations, experiences);
    const meetRate = pct(meetings, conversations);

    const steps: Array<{
      label: string;
      from: number;
      to: number;
      rate: number | null;
      hint: string;
    }> = [
      {
        label: "Sessions → Experience shown",
        from: sessions,
        to: experiences,
        rate: exRate,
        hint: "Widget coverage & targeting (is the experience eligible on the pages getting traffic?)",
      },
      {
        label: "Experience → Conversation",
        from: experiences,
        to: conversations,
        rate: convoRate,
        hint: "Offer relevance, timing, copy, routing speed, bot/rep availability",
      },
      {
        label: "Conversation → Meeting",
        from: conversations,
        to: meetings,
        rate: meetRate,
        hint: "Scheduling flow, qualification, handoff, calendar availability",
      },
    ];

    const worst = steps
      .filter((s) => s.from > 0)
      .sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2))[0];

    const inboundReq = n(inbound?.requests);
    const repStarted = n(inbound?.rep_started);
    const bookingProposed = n(inbound?.booking_proposed);
    const meetingsBooked = n(inbound?.meetings_booked);

    const repStartRate = pct(repStarted, inboundReq);
    const bookingPropRate = pct(bookingProposed, inboundReq);
    const inboundMeetRate = pct(meetingsBooked, inboundReq);

    const alerts: Array<{ tone: "warn" | "info"; title: string; detail: string }> = [];
    if (inboundReq > 0 && repStartRate !== null && repStartRate < 0.35) {
      alerts.push({
        tone: "warn",
        title: "Low rep-start rate",
        detail: `Only ${fmtPct(repStartRate)} of inbound requests had a rep start a conversation.`,
      });
    }
    if (inboundReq > 0 && bookingPropRate !== null && bookingPropRate < 0.15) {
      alerts.push({
        tone: "info",
        title: "Few booking proposals",
        detail: `Booking was proposed on ${fmtPct(bookingPropRate)} of inbound requests.`,
      });
    }
    if (inboundReq > 0 && inboundMeetRate !== null && inboundMeetRate < 0.08) {
      alerts.push({
        tone: "warn",
        title: "Low inbound→meeting conversion",
        detail: `Only ${fmtPct(inboundMeetRate)} of inbound requests ended in a meeting booking.`,
      });
    }

    return {
      steps,
      worst,
      alerts,
      rates: { exRate, convoRate, meetRate, repStartRate, bookingPropRate, inboundMeetRate },
    };
  }, [engagement, inbound]);

  return (
    <div className="rounded-2xl border border-border/80 bg-white p-6 shadow-sm ring-1 ring-black/[0.04] dark:bg-card dark:ring-white/10">
      <div className="flex flex-col gap-1">
        <div className="text-base font-semibold tracking-tight">Key insights</div>
        <div className="text-sm text-muted-foreground">
          The “so what”: where conversion is leaking and what to look at next.
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <TrendingDown className="size-4" />
            Biggest drop
          </div>
          <div className="mt-2 text-sm font-medium text-foreground">{insights.worst?.label ?? "—"}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtPct(insights.worst?.rate ?? null)}</div>
          <div className="mt-2 text-xs leading-relaxed text-muted-foreground">{insights.worst?.hint ?? "—"}</div>
        </div>

        <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stage retention</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 truncate text-muted-foreground">Sessions → Experience</div>
              <div className="shrink-0 font-semibold tabular-nums">{fmtPct(insights.rates.exRate)}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 truncate text-muted-foreground">Experience → Conversation</div>
              <div className="shrink-0 font-semibold tabular-nums">{fmtPct(insights.rates.convoRate)}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 truncate text-muted-foreground">Conversation → Meeting</div>
              <div className="shrink-0 font-semibold tabular-nums">{fmtPct(insights.rates.meetRate)}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inbound health</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 truncate text-muted-foreground">Rep started / inbound</div>
              <div className="shrink-0 font-semibold tabular-nums">{fmtPct(insights.rates.repStartRate)}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 truncate text-muted-foreground">Booking proposed / inbound</div>
              <div className="shrink-0 font-semibold tabular-nums">{fmtPct(insights.rates.bookingPropRate)}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 truncate text-muted-foreground">Meetings booked / inbound</div>
              <div className="shrink-0 font-semibold tabular-nums">{fmtPct(insights.rates.inboundMeetRate)}</div>
            </div>
          </div>

          {insights.alerts.length ? (
            <div className="mt-3 space-y-2">
              {insights.alerts.slice(0, 2).map((a, idx) => (
                <div
                  key={idx}
                  className={[
                    "flex gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed",
                    a.tone === "warn"
                      ? "border-rose-200/80 bg-rose-50/50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/25 dark:text-rose-100"
                      : "border-fuchsia-200/80 bg-fuchsia-50/40 text-fuchsia-900 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20 dark:text-fuchsia-100",
                  ].join(" ")}
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 opacity-80" />
                  <div className="min-w-0">
                    <div className="font-semibold">{a.title}</div>
                    <div className="opacity-90">{a.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <ArrowRight className="size-3.5" />
              No obvious inbound bottlenecks detected in this range.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

