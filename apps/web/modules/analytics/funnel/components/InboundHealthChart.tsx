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

import { PALETTE } from "@/modules/analytics/shared/analytics-primitives";

type Inbound = {
  requests?: number;
  rep_started?: number;
  booking_proposed?: number; // ✅ new
  meetings_booked?: number; // ✅ optional (or reuse engagement.meetings)
};

function n(x: any) {
  const v = Number(x ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export function InboundHealthChart({ data }: { data?: Inbound | null }) {
  const rows = useMemo(() => {
    return [
      { name: "Chat requests", value: n(data?.requests), key: "req" },
      { name: "Rep started", value: n(data?.rep_started), key: "rep" },
      { name: "Booking proposed", value: n(data?.booking_proposed), key: "book" },
      { name: "Meetings", value: n(data?.meetings_booked), key: "mtg" },
    ];
  }, [data]);

  const hasAny = rows.some((r) => r.value > 0);

  if (!hasAny) {
    return (
      <div className="flex h-[220px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/15 px-6 text-center">
        <p className="text-sm font-medium text-foreground">No inbound touches</p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          Inbound requests and downstream steps will show when visitors engage the widget in this window.
        </p>
      </div>
    );
  }

  const fills = PALETTE.chart;

  return (
    <div className="h-[280px] w-full rounded-xl bg-gradient-to-b from-muted/25 to-transparent px-1 pt-2">
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