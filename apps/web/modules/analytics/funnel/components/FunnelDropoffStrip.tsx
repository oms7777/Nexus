"use client";

import { PALETTE } from "@/modules/analytics/shared/analytics-primitives";

type Engagement = {
  sessions?: number;
  experiences?: number;
  conversations?: number;
  meetings?: number;
};

function n(x: any) {
  const v = Number(x ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function pct(numer: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((numer / den) * 1000) / 10;
}

/**
 * Stage-to-stage retention: shows where volume drops (complement to the funnel shape).
 */
export function FunnelDropoffStrip({ data }: { data?: Engagement | null }) {
  const s = n(data?.sessions);
  const e = n(data?.experiences);
  const c = n(data?.conversations);
  const m = n(data?.meetings);

  const items: { label: string; value: number | null; hint: string }[] = [
    { label: "Session → experience", value: pct(e, s), hint: "Experience events vs unique sessions in period" },
    { label: "Experience → conv.", value: pct(c, e), hint: "Conversations created vs experience events" },
    { label: "Conv. → meeting", value: pct(m, c), hint: "Meetings booked vs conversations" },
  ];

  return (
    <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {items.map((it, idx) => (
        <div
          key={it.label}
          title={it.hint}
          className="rounded-xl border border-border/70 bg-gradient-to-br from-white to-fuchsia-50/40 px-3 py-2.5 shadow-sm ring-1 ring-black/[0.03] dark:from-card dark:to-fuchsia-950/20 dark:ring-white/10"
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{it.label}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className="text-xl font-semibold tabular-nums tracking-tight text-foreground"
              style={{ color: PALETTE.chart[idx % PALETTE.chart.length] }}
            >
              {it.value !== null ? `${it.value}%` : "—"}
            </span>
            {it.value !== null && idx === 0 && it.value < 30 ? (
              <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">Thin top</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
