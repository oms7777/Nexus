"use client";

import { PALETTE } from "@/modules/analytics/shared/analytics-primitives";

type Engagement = {
  sessions?: number;
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
 * Stage-to-stage retention: Sessions → Conversations → Meetings.
 */
export function FunnelDropoffStrip({ data }: { data?: Engagement | null }) {
  const s = n(data?.sessions);
  const c = n(data?.conversations);
  const m = n(data?.meetings);

  const items: { label: string; value: number | null; hint: string }[] = [
    {
      label: "Session → conversation",
      value: pct(c, s),
      hint: "Visitors who opened a chat vs unique sessions",
    },
    {
      label: "Conversation → meeting",
      value: pct(m, c),
      hint: "Meetings booked vs conversations started",
    },
  ];

  return (
    <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {items.map((it, idx) => (
        <div
          key={it.label}
          className={[
            "rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5",
            idx === 0 && it.value != null && it.value < 25 ? "border-amber-200/80 bg-amber-50/50" : "",
          ].join(" ")}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {it.label}
          </div>
          <div
            className={[
              "mt-0.5 text-2xl font-semibold tabular-nums tracking-tight",
              PALETTE.gradient.includes("fuchsia") ? "" : "",
            ].join(" ")}
          >
            {it.value == null ? "—" : `${it.value}%`}
            {it.value != null && it.value < 25 && idx === 0 ? (
              <span className="ml-2 text-[10px] font-medium uppercase text-amber-800">thin top</span>
            ) : null}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{it.hint}</div>
        </div>
      ))}
    </div>
  );
}
