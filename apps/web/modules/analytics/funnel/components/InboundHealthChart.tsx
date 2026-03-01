"use client";

import React, { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

type Inbound = {
  requests?: number;
  with_rep_available?: number;
  rep_started?: number;
  started_before_sla?: number;
};

function n(x: any) {
  const v = Number(x ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export function InboundHealthChart({
  data,
  showSla = true,
}: {
  data?: Inbound | null;
  showSla?: boolean;
}) {
  const rows = useMemo(() => {
    const base = [
      { name: "Requests", value: n(data?.requests) },
      { name: "Rep available", value: n(data?.with_rep_available) },
      { name: "Rep started", value: n(data?.rep_started) },
    ];
    if (showSla) base.push({ name: "Started < SLA", value: n(data?.started_before_sla) });
    return base;
  }, [data, showSla]);

  const hasAny = rows.some((r) => r.value > 0);

  if (!hasAny) {
    return (
      <div className="h-[220px] w-full rounded-xl border bg-muted/20 flex items-center justify-center text-sm text-muted-foreground">
        No inbound activity in selected period.
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barCategoryGap={18}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip formatter={(value: any) => [Number(value ?? 0).toLocaleString(), "Count"]} />
          <Bar dataKey="value" fill="#a855f7" isAnimationActive={false} radius={[10, 10, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}