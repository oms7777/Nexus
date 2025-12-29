"use client";

import React from "react";
import {
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  Tooltip,
  LabelList,
} from "recharts";

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

export function EngagementFunnelChart({
  data,
}: {
  data?: Engagement | null;
}) {
  const sessions = n(data?.sessions);
  const experiences = n(data?.experiences);
  const conversations = n(data?.conversations);
  const meetings = n(data?.meetings);

  const rows = [
    { name: "Sessions", value: sessions },
    { name: "Experience", value: experiences },
    { name: "Conversations", value: conversations },
    { name: "Meetings", value: meetings },
  ];

  // Recharts FunnelChart needs >= 1 value
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
          <Tooltip
            formatter={(value: any, name: any) => [fmt(value), String(name)]}
          />
          <Funnel dataKey="value" data={rows} isAnimationActive={false}>
            <LabelList
              position="right"
              dataKey="name"
              formatter={(label: any) => String(label)}
            />
            <LabelList
              position="inside"
              dataKey="value"
              formatter={(v: any) => fmt(v)}
            />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    </div>
  );
}
