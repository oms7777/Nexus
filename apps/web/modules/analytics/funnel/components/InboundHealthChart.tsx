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
} from "recharts";

type Inbound = {
  requests?: number;
  rep_started?: number;
  booking_proposed?: number; // ✅ new
  meetings_booked?: number;  // ✅ optional (or reuse engagement.meetings)
};

function n(x: any) {
  const v = Number(x ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export function InboundHealthChart({ data }: { data?: Inbound | null }) {
  const rows = useMemo(() => {
    return [
      { name: "Requests", value: n(data?.requests) },
      { name: "Rep started", value: n(data?.rep_started) },
      { name: "Booking proposed (30s)", value: n(data?.booking_proposed) },
      { name: "Meetings booked", value: n(data?.meetings_booked) },
    ];
  }, [data]);

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
          <Tooltip
            formatter={(value: any) => [Number(value ?? 0).toLocaleString(), "Count"]}
          />
          <Bar dataKey="value" fill="#a855f7" isAnimationActive={false} radius={[10, 10, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}