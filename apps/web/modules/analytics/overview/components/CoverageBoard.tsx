"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { CardShell } from "@/modules/analytics/shared/analytics-primitives";

export function CoverageBoard() {
  const data = useQuery(api.private.live.getCoverageBoard, {});

  if (data === undefined) {
    return (
      <CardShell title="Live coverage" subtitle="Visitors vs reps online by territory">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </CardShell>
    );
  }

  const hot = data.rows.filter((r) => r.uncovered);
  const top = data.rows.filter((r) => r.visitors > 0 || r.onlineReps > 0).slice(0, 6);

  return (
    <CardShell
      title="Live coverage"
      subtitle="Are we staffed where visitors are right now?"
      right={
        <Link href="/live" className="text-xs font-medium text-fuchsia-700 hover:underline">
          Open Live Map
        </Link>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-2">
        <MiniStat label="Visitors live" value={data.visitorsLive} />
        <MiniStat label="Reps online" value={data.onlineRepsTotal} />
        <MiniStat
          label="Uncovered zones"
          value={data.uncoveredTerritories}
          warn={data.uncoveredTerritories > 0}
        />
      </div>

      {hot.length > 0 ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <span className="font-semibold">Staffing gap:</span>{" "}
          {hot
            .slice(0, 3)
            .map((r) => `${r.territoryLabel} (${r.visitors} visitor${r.visitors === 1 ? "" : "s"}, 0 reps)`)
            .join(" · ")}
        </p>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">
          No uncovered territories with live visitors
          {data.unmappedVisitors > 0
            ? ` · ${data.unmappedVisitors} visitor(s) outside mapped territories`
            : ""}
          .
        </p>
      )}

      {top.length === 0 ? (
        <p className="text-sm text-muted-foreground">No live traffic in territories yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {top.map((r) => (
            <li
              key={r.territoryKey}
              className={[
                "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                r.uncovered
                  ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20"
                  : "border-border/60 bg-muted/20",
              ].join(" ")}
            >
              <span className="font-medium truncate">{r.territoryLabel}</span>
              <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                {r.visitors} vis · {r.onlineReps} online
              </span>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function MiniStat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div
      className={[
        "rounded-xl border px-3 py-2",
        warn
          ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/30"
          : "border-border/60 bg-muted/30",
      ].join(" ")}
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}
