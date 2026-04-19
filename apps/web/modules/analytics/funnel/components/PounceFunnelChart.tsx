"use client";

import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

import { PALETTE, PRIMARY_CHART_SURFACE } from "@/modules/analytics/shared/analytics-primitives";

export type PounceStats = {
  attempts?: number;
  conversations?: number;
  meetings?: number;
};

function n(x: any) {
  const v = Number(x ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export function PounceFunnelChart({ data }: { data?: PounceStats | null }) {
  const rows = useMemo(() => {
    return [
      { name: "Pounce attempts", value: n(data?.attempts), key: "att" },
      { name: "Conversations", value: n(data?.conversations), key: "conv" },
      { name: "Meetings", value: n(data?.meetings), key: "mtg" },
    ];
  }, [data]);

  const hasAny = rows.some((r) => r.value > 0);

  if (!hasAny) {
    return (
      <div className="flex h-[220px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/15 px-6 text-center">
        <p className="text-sm font-medium text-foreground">No proactive touches</p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          Pounce events will appear when your automation emits{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">pounce_attempt</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">pounce_conversation</code>, and{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">pounce_meeting</code>.
        </p>
      </div>
    );
  }

  const fills = PALETTE.chart;

  return (
    <div className={`h-[280px] w-full ${PRIMARY_CHART_SURFACE}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barCategoryGap={18} margin={{ top: 12, right: 8, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/60" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} />
          <YAxis tickLine={false} axisLine={false} width={36} />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid hsl(var(--border))",
              boxShadow: "0 4px 14px rgb(0 0 0 / 0.06)",
            }}
            formatter={(value: any) => [Number(value ?? 0).toLocaleString(), "Events"]}
          />
          <Bar dataKey="value" isAnimationActive={false} radius={[10, 10, 0, 0]} maxBarSize={56}>
            {rows.map((_, i) => (
              <Cell key={i} fill={fills[i % fills.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
