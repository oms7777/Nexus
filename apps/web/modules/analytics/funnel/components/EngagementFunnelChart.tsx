"use client";

import React from "react";
import { ResponsiveContainer, FunnelChart, Funnel, Tooltip, LabelList } from "recharts";

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

function fmt(v: any) {
  return n(v).toLocaleString();
}

export function EngagementFunnelChart({ data }: { data?: Engagement | null }) {
  const cols = PALETTE.chart;
  const rows = [
    { name: "Sessions", value: n(data?.sessions), fill: cols[0] },
    { name: "Experience", value: n(data?.experiences), fill: cols[1] },
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
    <div className="h-[260px] w-full rounded-xl bg-gradient-to-b from-muted/30 to-transparent px-1 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart margin={{ top: 12, right: 16, bottom: 8, left: 16 }}>
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid hsl(var(--border))",
              boxShadow: "0 4px 14px rgb(0 0 0 / 0.06)",
            }}
            formatter={(value: any, name: any) => [fmt(value), String(name)]}
          />
          <Funnel dataKey="value" data={rows} isAnimationActive={false}>
            <LabelList
              position="right"
              dataKey="name"
              className="fill-foreground text-xs font-medium"
              formatter={(label: any) => String(label)}
            />
            <LabelList
              position="inside"
              dataKey="value"
              className="fill-white text-sm font-semibold drop-shadow-sm"
              formatter={(v: any) => fmt(v)}
            />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    </div>
  );
}