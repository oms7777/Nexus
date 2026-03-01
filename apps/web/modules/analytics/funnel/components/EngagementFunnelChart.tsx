"use client";

import React from "react";
import { ResponsiveContainer, FunnelChart, Funnel, Tooltip, LabelList } from "recharts";

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
  const rows = [
    { name: "Sessions", value: n(data?.sessions), fill: "#a855f7" },
    { name: "Experience", value: n(data?.experiences), fill: "#d946ef" },
    { name: "Conversations", value: n(data?.conversations), fill: "#ec4899" },
    { name: "Meetings", value: n(data?.meetings), fill: "#f43f5e" },
  ];

  const hasAny = rows.some((r) => r.value > 0);

  if (!hasAny) {
    return (
      <div className="h-[220px] w-full rounded-xl border bg-muted/20 flex items-center justify-center text-sm text-muted-foreground">
        No data in selected period.
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart>
          <Tooltip formatter={(value: any, name: any) => [fmt(value), String(name)]} />
          <Funnel dataKey="value" data={rows} isAnimationActive={false}>
            <LabelList position="right" dataKey="name" formatter={(label: any) => String(label)} />
            <LabelList position="inside" dataKey="value" formatter={(v: any) => fmt(v)} />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    </div>
  );
}