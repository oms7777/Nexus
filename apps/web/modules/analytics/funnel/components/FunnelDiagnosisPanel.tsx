"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { CardShell, Row } from "@/modules/analytics/shared/analytics-primitives";

export type FunnelDiagnosis = {
  missedHandoffs: number;
  missedConversationIds: string[];
  sla: {
    median_sec: number | null;
    p90_sec: number | null;
    within_sla_rate: number | null;
    conversations_with_rep: number;
    slaSeconds: number;
  };
  pagesDontBook: Array<{ page: string; sessions: number; meetings: number }>;
};

function fmtSec(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

function fmtPct(rate: number | null | undefined) {
  if (rate == null || !Number.isFinite(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function FunnelDiagnosisPanel({
  diagnosis,
  showPlanBadge,
}: {
  diagnosis: FunnelDiagnosis | null | undefined;
  showPlanBadge?: ReactNode;
}) {
  if (!diagnosis) {
    return (
      <CardShell title="Diagnose leaks" subtitle="Missed handoffs, response SLA, pages that don’t book">
        <p className="text-sm text-muted-foreground">No diagnosis data for this period.</p>
      </CardShell>
    );
  }

  const { missedHandoffs, missedConversationIds, sla, pagesDontBook } = diagnosis;
  const slow =
    sla.within_sla_rate != null && sla.conversations_with_rep > 0 && sla.within_sla_rate < 0.7;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <CardShell
        title="Missed handoffs"
        subtitle="Chat requested — no rep started the conversation"
        right={showPlanBadge}
        className="lg:col-span-4"
      >
        <div
          className={[
            "mb-3 text-4xl font-semibold tabular-nums tracking-tight",
            missedHandoffs > 0 ? "text-rose-700 dark:text-rose-300" : "",
          ].join(" ")}
        >
          {missedHandoffs.toLocaleString()}
        </div>
        {missedHandoffs === 0 ? (
          <p className="text-sm text-muted-foreground">All chat requests got a rep start this period.</p>
        ) : (
          <ul className="space-y-1.5">
            {missedConversationIds.slice(0, 8).map((id) => (
              <li key={id}>
                <Link
                  href={`/conversations/${id}`}
                  className="text-sm font-medium text-fuchsia-700 hover:underline dark:text-fuchsia-300"
                >
                  Open conversation →
                </Link>
              </li>
            ))}
            {missedHandoffs > missedConversationIds.length ? (
              <li className="text-xs text-muted-foreground">
                +{missedHandoffs - missedConversationIds.length} more without a deep link
              </li>
            ) : null}
          </ul>
        )}
      </CardShell>

      <CardShell
        title="First-response SLA"
        subtitle={`Target: under ${sla.slaSeconds}s to first rep message`}
        right={showPlanBadge}
        className="lg:col-span-4"
      >
        <div className="grid gap-2">
          <Row label="Within SLA" value={fmtPct(sla.within_sla_rate)} />
          <Row label="Median" value={fmtSec(sla.median_sec)} />
          <Row label="P90" value={fmtSec(sla.p90_sec)} />
          <Row label="Conversations measured" value={String(sla.conversations_with_rep)} />
        </div>
        {slow ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            Under 70% within SLA — coach speed of first touch yesterday / this period.
          </p>
        ) : null}
      </CardShell>

      <CardShell
        title="Pages that don’t book"
        subtitle="Traffic with zero meetings — fix CTA or routing"
        right={showPlanBadge}
        className="lg:col-span-4"
      >
        {pagesDontBook.length === 0 ? (
          <p className="text-sm text-muted-foreground">No high-traffic pages with 0 meetings (≥2 sessions).</p>
        ) : (
          <ul className="space-y-1.5">
            {pagesDontBook.map((p) => (
              <li
                key={p.page}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-medium" title={p.page}>
                  {p.page}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                  {p.sessions} sess · 0 mtgs
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardShell>
    </div>
  );
}
