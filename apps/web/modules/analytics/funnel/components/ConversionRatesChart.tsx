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

type Conversion = {
  meetings_from_conversations_num?: number;
  meetings_from_conversations_den?: number;
  conversations_from_experiences_num?: number;
  conversations_from_experiences_den?: number;
};

function n(x: any) {
  const v = Number(x ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function pct(num: number, den: number) {
  if (den <= 0) return 0;
  return Math.round((num / den) * 100);
}

export function ConversionRatesChart({
  data,
}: {
  data?: Conversion | null;
}) {
  const rows = useMemo(() => {
    const mNum = n(data?.meetings_from_conversations_num);
    const mDen = n(data?.meetings_from_conversations_den);

    const cNum = n(data?.conversations_from_experiences_num);
    const cDen = n(data?.conversations_from_experiences_den);

    return [
      {
        name: "Conv → Meeting",
        rate: pct(mNum, mDen),
        num: mNum,
        den: mDen,
      },
      {
        name: "Exp → Conv",
        rate: pct(cNum, cDen),
        num: cNum,
        den: cDen,
      },
    ];
  }, [data]);

  const hasAny = rows.some((r) => r.den > 0);

  if (!hasAny) {
    return (
      <div className="h-[220px] w-full rounded-xl border bg-muted/20 flex items-center justify-center text-sm text-muted-foreground">
        No conversion data yet.
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barCategoryGap={32}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} />
          <YAxis
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            formatter={(value: any, _name: any, ctx: any) => {
              const r = ctx?.payload;
              return [`${value}%`, `${r?.num?.toLocaleString?.() ?? 0} / ${r?.den?.toLocaleString?.() ?? 0}`];
            }}
          />
          <Bar dataKey="rate" isAnimationActive={false} radius={[10, 10, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
