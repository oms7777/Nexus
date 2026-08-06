"use client";

import React from "react";
import { ResponsiveContainer, FunnelChart, Funnel, Tooltip, LabelList } from "recharts";

import { PALETTE, PRIMARY_CHART_SURFACE } from "@/modules/analytics/shared/analytics-primitives";

type Engagement = {
  sessions?: number;
  conversations?: number;
  meetings?: number;
};

function n(x: any) {
  const v = Number(x ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function fmt(v: any) {
  return n(v).toLocaleString();
}

/** Volume funnel: Sessions → Conversations → Meetings (Experience removed — same event as conversation). */
export function EngagementFunnelChart({ data }: { data?: Engagement | null }) {
  const cols = PALETTE.chart;
  const rows = [
    { name: "Sessions", value: n(data?.sessions), fill: cols[0] },
    { name: "Conversations", value: n(data?.conversations), fill: cols[2] },
    { name: "Meetings", value: n(data?.meetings), fill: cols[3] },
  ];

  const hasAny = rows.some((r) => r.value > 0);

  if (!hasAny) {
    return (
      <div className="flex h-[220px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/15 px-6 text-center">
        <p className="text-sm font-medium text-foreground">No funnel volume</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Try widening the date range or confirm the widget is firing analytics events on your sites.
        </p>
      </div>
    );
  }

  return (
    <div className={`h-[280px] w-full ${PRIMARY_CHART_SURFACE}`}>
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart>
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid hsl(var(--border))",
              boxShadow: "0 4px 14px rgb(0 0 0 / 0.06)",
            }}
            formatter={(value: any) => [fmt(value), "Volume"]}
          />
          <Funnel dataKey="value" data={rows} isAnimationActive={false}>
            <LabelList
              position="right"
              fill="hsl(var(--foreground))"
              stroke="none"
              dataKey="name"
              className="text-xs font-medium"
            />
            <LabelList
              position="center"
              fill="#fff"
              stroke="none"
              dataKey="value"
              formatter={fmt}
              className="text-sm font-semibold"
            />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    </div>
  );
}
