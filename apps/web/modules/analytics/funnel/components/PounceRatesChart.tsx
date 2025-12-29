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

type Pounce = {
  attempts?: number;
  conversations?: number;
  meetings?: number;
};

function n(x: any) {
  const v = Number(x ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function pct(num: number, den: number) {
  if (den <= 0) return 0;
  return Math.round((num / den) * 100);
}

export function PounceRatesChart({
  data,
}: {
  data?: Pounce | null;
}) {
  const rows = useMemo(() => {
    const attempts = n(data?.attempts);
    const conv = n(data?.conversations);
    const meet = n(data?.meetings);

    return [
      {
        name: "Attempts",
        value: attempts,
        rate: 100,
      },
      {
        name: "Conversations",
        value: conv,
        rate: pct(conv, attempts),
      },
      {
        name: "Meetings",
        value: meet,
        rate: pct(meet, attempts),
      },
    ];
  }, [data]);

  const hasAny = rows.some((r) => r.value > 0);

  if (!hasAny) {
    return (
      <div className="h-[220px] w-full rounded-xl border bg-muted/20 flex items-center justify-center text-sm text-muted-foreground">
        No pounce activity in selected period.
      </div>
    );
  }

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barCategoryGap={24}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(value: any, _name: any, ctx: any) => {
              const r = ctx?.payload;
              const v = Number(value ?? 0);
              const rate = Number(r?.rate ?? 0);
              return [`${v.toLocaleString()} (${rate}%)`, "Count (rate vs attempts)"];
            }}
          />
          <Bar dataKey="value" isAnimationActive={false} radius={[10, 10, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
