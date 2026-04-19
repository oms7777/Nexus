"use client";

import React from "react";

/** Shared palette: fuchsia/rose (matches funnel & overview) */
export const PALETTE = {
  gradient: "bg-gradient-to-r from-fuchsia-600 to-rose-500",
  gradientBorder: "border-fuchsia-200",
  hoverBg: "hover:bg-fuchsia-50",
  hoverBorder: "hover:border-fuchsia-200",
  cardHover: "transition hover:shadow-md hover:border-fuchsia-200",
  chart: ["#a855f7", "#d946ef", "#ec4899", "#f43f5e"],
} as const;

export function BrandPill({ children }: { children: React.ReactNode }) {
  return (
    <div className={`rounded-full border ${PALETTE.gradientBorder} ${PALETTE.gradient} px-3 py-1 text-xs font-semibold text-white shadow-sm`}>
      {children}
    </div>
  );
}

export function RangePills({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const opts = [7, 30, 90];
  return (
    <div className="inline-flex rounded-xl border bg-white p-1 shadow-sm">
      {opts.map((d) => {
        const active = d === value;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={[
              "px-3 py-1.5 text-sm rounded-lg transition",
              active ? `${PALETTE.gradient} text-white shadow-sm` : `text-muted-foreground ${PALETTE.hoverBg} hover:text-foreground`,
            ].join(" ")}
          >
            {d}d
          </button>
        );
      })}
    </div>
  );
}

export function CardShell({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-border/80 bg-white p-6 shadow-sm ring-1 ring-black/[0.04] dark:bg-card dark:ring-white/10",
        PALETTE.cardHover,
        className,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold tracking-tight">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Shared by StatCard and Overview hero — semantic up / down / flat. */
export function DeltaPill({ delta, className = "" }: { delta?: number | null; className?: string }) {
  const d = typeof delta === "number" ? delta : null;
  if (d === null) return null;
  const sign = d > 0 ? "+" : "";
  const pct = `${sign}${Math.round(d * 100)}%`;
  const tone = d > 0 ? "up" : d < 0 ? "down" : "flat";
  const deltaPillClass =
    tone === "up"
      ? "border-emerald-200/90 bg-emerald-50 text-emerald-900 dark:border-emerald-900/45 dark:bg-emerald-950/50 dark:text-emerald-100"
      : tone === "down"
        ? "border-rose-200/90 bg-rose-50 text-rose-900 dark:border-rose-900/45 dark:bg-rose-950/50 dark:text-rose-100"
        : "border-muted bg-muted/45 text-muted-foreground";

  return (
    <div
      className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums shadow-sm ${deltaPillClass} ${className}`}
      title="Compared to the immediately previous period of the same length (e.g. prior 30 days when 30d is selected)."
    >
      <span className="mr-1.5 opacity-70">vs prior</span>
      {tone === "up" ? <span aria-hidden>↑ </span> : tone === "down" ? <span aria-hidden>↓ </span> : null}
      {pct}
    </div>
  );
}

export function StatCard({
  label,
  value,
  delta,
  sub,
}: {
  label: string;
  value: number;
  delta?: number | null;
  sub?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-border/80 bg-white p-6 shadow-sm ring-1 ring-black/[0.04] dark:bg-card dark:ring-white/10 ${PALETTE.cardHover}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">
            {(value ?? 0).toLocaleString()}
          </div>
          {sub ? <div className="mt-2 text-xs text-muted-foreground">{sub}</div> : null}
        </div>
        <DeltaPill delta={delta} />
      </div>
    </div>
  );
}

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{String(value ?? "—")}</span>
    </div>
  );
}

export function MiniTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-12 gap-3 border-b bg-fuchsia-50/60 px-4 py-2 text-xs uppercase text-muted-foreground">
        <div className="col-span-5">{columns[0]}</div>
        <div className="col-span-7">{columns[1]}</div>
      </div>
      <div className="divide-y">
        {rows.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">No data yet.</div>
        ) : (
          rows.map((r, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-3 px-4 py-3 text-sm hover:bg-fuchsia-50/40 transition">
              <div className="col-span-5 font-medium truncate">{r[0]}</div>
              <div className="col-span-7 text-muted-foreground">{r[1]}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function MiniBarTable({
  columns,
  rows,
  maxBarValue,
}: {
  columns: [string, string];
  rows: Array<{
    label: React.ReactNode;
    /** Number shown in UI, used for bar length and % calc. */
    primaryValue: number;
    /** Optional right-side detail (e.g. "12 • 3 • 1"). */
    detail?: React.ReactNode;
  }>;
  /** Defaults to max primaryValue from rows. */
  maxBarValue?: number;
}) {
  const max =
    typeof maxBarValue === "number" && Number.isFinite(maxBarValue)
      ? Math.max(0, maxBarValue)
      : Math.max(0, ...rows.map((r) => Number(r.primaryValue ?? 0)));
  const total = rows.reduce((s, r) => s + Number(r.primaryValue ?? 0), 0);

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-12 gap-3 border-b bg-fuchsia-50/60 px-4 py-2 text-xs uppercase text-muted-foreground">
        <div className="col-span-6">{columns[0]}</div>
        <div className="col-span-6 text-right">{columns[1]}</div>
      </div>
      <div className="divide-y">
        {rows.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">No data yet.</div>
        ) : (
          rows.map((r, idx) => {
            const v = Number(r.primaryValue ?? 0);
            const pct = total > 0 ? Math.round((v / total) * 100) : 0;
            const widthPct = max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0;
            return (
              <div
                key={idx}
                className="grid grid-cols-12 gap-3 px-4 py-3 text-sm hover:bg-fuchsia-50/40 transition"
              >
                <div className="col-span-6 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate font-medium">{r.label}</div>
                    <div className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {pct}%
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-fuchsia-600 to-rose-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
                <div className="col-span-6 text-right tabular-nums">
                  <div className="font-medium text-foreground">
                    {v.toLocaleString()}
                  </div>
                  {r.detail ? (
                    <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{r.detail}</div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Geography / territory rows: separate numeric columns (more scannable than one concatenated cell). */
export function GeoKpiTable({
  rows,
  nameColumnLabel = "Country",
}: {
  rows: Array<{
    label: React.ReactNode;
    sessions: number;
    conversations: number;
    meetings: number;
  }>;
  /** First column header (e.g. "Territory" for territory rollup). */
  nameColumnLabel?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/80 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/10">
      <div className="grid grid-cols-12 gap-2 border-b bg-gradient-to-r from-fuchsia-50/80 to-rose-50/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground dark:from-fuchsia-950/30 dark:to-rose-950/20">
        <div className="col-span-4">{nameColumnLabel}</div>
        <div className="col-span-2 text-right tabular-nums">Sessions</div>
        <div className="col-span-3 text-right tabular-nums">Conversations</div>
        <div className="col-span-3 text-right tabular-nums">Meetings</div>
      </div>
      <div className="divide-y divide-border/60">
        {rows.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">No data yet.</div>
        ) : (
          rows.map((r, idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm transition hover:bg-fuchsia-50/35 dark:hover:bg-fuchsia-950/20"
            >
              <div className="col-span-4 min-w-0 truncate font-medium">{r.label}</div>
              <div className="col-span-2 text-right tabular-nums text-foreground">{r.sessions.toLocaleString()}</div>
              <div className="col-span-3 text-right tabular-nums text-muted-foreground">
                {r.conversations.toLocaleString()}
              </div>
              <div className="col-span-3 text-right tabular-nums font-medium text-foreground">
                {r.meetings.toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
