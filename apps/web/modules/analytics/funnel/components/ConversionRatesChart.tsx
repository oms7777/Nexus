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
  LabelList,
} from "recharts";

import { PALETTE, PRIMARY_CHART_SURFACE } from "@/modules/analytics/shared/analytics-primitives";

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

export function ConversionRatesChart({ data }: { data?: Conversion | null }) {
  const rows = useMemo(() => {
    const mNum = n(data?.meetings_from_conversations_num);
    const mDen = n(data?.meetings_from_conversations_den);

    const cNum = n(data?.conversations_from_experiences_num);
    const cDen = n(data?.conversations_from_experiences_den);

    return [
      { name: "Conv → Meeting", rate: pct(mNum, mDen), num: mNum, den: mDen },
      { name: "Exp → Conv", rate: pct(cNum, cDen), num: cNum, den: cDen },
    ];
  }, [data]);

  const hasAny = rows.some((r) => r.den > 0);

  if (!hasAny) {
    return (
      <div className="flex h-[220px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/15 px-6 text-center">
        <p className="text-sm font-medium text-foreground">Not enough data</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Conversion rates appear once experiences and conversations exist in this period.
        </p>
      </div>
    );
  }

  const fills = [PALETTE.chart[2] ?? "#ec4899", PALETTE.chart[0] ?? "#a855f7"];

  return (
    <div className={`h-[260px] w-full ${PRIMARY_CHART_SURFACE}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barCategoryGap={36} margin={{ top: 20, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/60" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            width={36}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid hsl(var(--border))",
              boxShadow: "0 4px 14px rgb(0 0 0 / 0.06)",
            }}
            formatter={(value: any, _name: any, ctx: any) => {
              const r = ctx?.payload;
              return [
                `${Number(value ?? 0)}% (${r?.num?.toLocaleString?.() ?? 0} / ${r?.den?.toLocaleString?.() ?? 0})`,
                "Conversion",
              ];
            }}
          />
          <Bar dataKey="rate" isAnimationActive={false} radius={[12, 12, 0, 0]} maxBarSize={72}>
            {rows.map((_, i) => (
              <Cell key={i} fill={fills[i % fills.length]} />
            ))}
            <LabelList
              dataKey="rate"
              position="top"
              formatter={(v: number) => `${v}%`}
              className="fill-foreground text-xs font-semibold"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}