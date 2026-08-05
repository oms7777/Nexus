"use client";

import React from "react";

import { DeltaPill, PRIMARY_OUTCOME_PANEL } from "@/modules/analytics/shared/analytics-primitives";

export function PrimaryOutcomeStrip({
  meetings,
  sessions,
  conversations,
  meetingsDelta,
  insight,
}: {
  meetings: number;
  sessions: number;
  conversations: number;
  meetingsDelta?: number | null;
  /** One-line verdict: what booked (no LLM). */
  insight?: string | null;
}) {
  const meetingsN = Number(meetings ?? 0);
  const sessionsN = Number(sessions ?? 0);
  const conversationsN = Number(conversations ?? 0);
  const sessionToMtgPct = sessionsN > 0 ? (meetingsN / sessionsN) * 100 : 0;
  const convToMtgPct = conversationsN > 0 ? (meetingsN / conversationsN) * 100 : 0;

  return (
    <div className={PRIMARY_OUTCOME_PANEL}>
      <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
        <div className="min-w-0 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-800/90 dark:text-fuchsia-300/90">
            Primary outcome
          </p>
          <div className="flex flex-wrap items-end gap-3 gap-y-1">
            <span className="text-5xl font-bold tracking-tight tabular-nums text-foreground sm:text-6xl">
              {meetingsN.toLocaleString()}
            </span>
            <span className="pb-1 text-lg font-medium text-muted-foreground">meetings booked</span>
            <DeltaPill delta={meetingsDelta ?? null} className="mb-1" />
          </div>
          {insight ? (
            <p className="max-w-2xl border-l-2 border-fuchsia-400/80 pl-3 text-sm leading-relaxed text-foreground/90">
              {insight}
            </p>
          ) : (
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Booked meetings attributed to this period — no CRM required.
            </p>
          )}
        </div>
        <div className="grid w-full max-w-md shrink-0 grid-cols-3 gap-2 sm:gap-3 lg:max-w-lg">
          <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-3 shadow-sm dark:border-border dark:bg-card/95">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Session → meeting
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {sessionToMtgPct.toFixed(1)}%
            </div>
          </div>
          <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-3 shadow-sm dark:border-border dark:bg-card/95">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Conv. → meeting
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {convToMtgPct.toFixed(1)}%
            </div>
          </div>
          <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-3 shadow-sm dark:border-border dark:bg-card/95">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Sessions</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {sessionsN.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
