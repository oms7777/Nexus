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
    <div className={["rounded-2xl border bg-white p-6 shadow-sm", PALETTE.cardHover, className].join(" ")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
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
  const d = typeof delta === "number" ? delta : null;
  const sign = d !== null && d > 0 ? "+" : "";
  const pct = d !== null ? `${sign}${Math.round(d * 100)}%` : null;

  return (
    <div className={`rounded-2xl border bg-white p-6 shadow-sm ${PALETTE.cardHover}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-4xl font-semibold mt-2">{(value ?? 0).toLocaleString()}</div>
          {sub ? <div className="mt-2 text-xs text-muted-foreground">{sub}</div> : null}
        </div>
        {pct ? (
          <div className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-semibold text-fuchsia-700">
            vs prev: {pct}
          </div>
        ) : null}
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
