"use client";

import React from "react";

import { DeltaPill, PALETTE } from "@/modules/analytics/shared/analytics-primitives";

function fmtPct(num: number, den: number) {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

const kpiCard =
  "rounded-xl border border-fuchsia-200/50 bg-gradient-to-br from-white via-fuchsia-50/40 to-rose-50/30 p-4 shadow-sm ring-1 ring-fuchsia-100/40 dark:border-fuchsia-900/35 dark:from-card dark:via-fuchsia-950/20 dark:to-rose-950/15 dark:ring-fuchsia-900/25";

/**
 * Replaces the heavy Primary outcome strip: compact KPIs + two unique visuals
 * (end-to-end session→meeting and inbound request→meeting) without repeating
 * the step rates already in the funnel / conversion charts.
 */
export function FunnelSummaryBanner({
  meetings,
  meetingsDelta,
  sessions,
  conversations,
  inboundRequests,
}: {
  meetings: number;
  meetingsDelta: number | null | undefined;
  sessions: number;
  conversations: number;
  inboundRequests: number;
}) {
  const m = Math.max(0, Math.round(Number(meetings ?? 0)));
  const s = Math.max(0, Math.round(Number(sessions ?? 0)));
  const c = Math.max(0, Math.round(Number(conversations ?? 0)));
  const ir = Math.max(0, Math.round(Number(inboundRequests ?? 0)));

  const sessionToMtg = fmtPct(m, s);
  /** Meetings can exceed inbound requests when bookings are not all from inbound chat. */
  const inboundToMtgPct = ir > 0 ? (m / ir) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={kpiCard}>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Meetings booked</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{m.toLocaleString()}</span>
            <DeltaPill delta={meetingsDelta ?? null} className="py-0.5 text-[10px]" />
          </div>
        </div>
        <div className={kpiCard}>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sessions</div>
          <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">{s.toLocaleString()}</div>
        </div>
        <div className={kpiCard}>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Conversations</div>
          <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">{c.toLocaleString()}</div>
        </div>
        <div className={kpiCard}>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Inbound requests</div>
          <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">{ir.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3.5 ring-1 ring-black/[0.03] dark:bg-muted/10 dark:ring-white/5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                End-to-end
              </div>
              <div className="mt-0.5 text-sm font-medium text-foreground">Session → booked meeting</div>
            </div>
            <div
              className="text-3xl font-bold tabular-nums tracking-tight"
              style={{ color: PALETTE.chart[0] }}
            >
              {sessionToMtg !== null ? `${sessionToMtg}%` : "—"}
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Share of sessions in this period that resulted in at least one meeting.
          </p>
        </div>

        <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3.5 ring-1 ring-black/[0.03] dark:bg-muted/10 dark:ring-white/5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Inbound pulse</div>
              <div className="mt-0.5 text-sm font-medium text-foreground">Requests → meetings</div>
            </div>
            <div
              className="text-3xl font-bold tabular-nums tracking-tight"
              style={{ color: PALETTE.chart[2] }}
            >
              {inboundToMtgPct !== null
                ? `${Math.round(inboundToMtgPct * 10) / 10}%`
                : ir === 0
                  ? "—"
                  : "0%"}
            </div>
          </div>
          {ir > 0 ? (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, inboundToMtgPct ?? 0)}%`,
                    background: `linear-gradient(90deg, ${PALETTE.chart[0]}, ${PALETTE.chart[2]})`,
                  }}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{m}</span> meetings vs{" "}
                <span className="font-medium text-foreground">{ir}</span> inbound chat requests in this range.
              </p>
            </>
          ) : (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              No inbound requests in this period — bar fills when visitors request a rep chat.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
