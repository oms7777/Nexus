"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

type Row = {
  day: string; // "YYYY-MM-DD"
  groupKey: string; // territoryKey
  groupLabel: string; // territoryLabel
  sessions: number;
  conversations: number;
  meetings: number;
};

function niceDayLabel(day: string) {
  const parts = day.split("-");
  if (parts.length !== 3) return day;
  return `${parts[1]}/${parts[2]}`;
}

/**
 * Multi-lines:
 * - On rend une ligne "sessions" par territory (top N)
 * - Option: on peut faire un toggle metric (sessions vs meetings) plus tard
 */
export function TimeseriesTerritoryMultiLineChart({
  data,
  topN = 5,
}: {
  data: Row[];
  topN?: number;
}) {
  if (!data?.length) {
    return <div className="text-sm text-muted-foreground">No data yet.</div>;
  }

  // 1) Total sessions par territory (pour topN)
  const totals = new Map<string, { label: string; sessions: number }>();
  for (const r of data) {
    const k = r.groupKey || "unknown";
    const prev = totals.get(k) ?? { label: r.groupLabel || k, sessions: 0 };
    totals.set(k, { label: prev.label, sessions: prev.sessions + (r.sessions ?? 0) });
  }

  const top = [...totals.entries()]
    .sort((a, b) => (b[1].sessions ?? 0) - (a[1].sessions ?? 0))
    .slice(0, topN)
    .map(([k, v]) => ({ key: k, label: v.label }));

  const topKeys = new Set(top.map((t) => t.key));

  // 2) Build per-day rows with keys: sessions_<territoryKey>, and "Other"
  const byDay = new Map<string, any>();

  for (const r of data) {
    const day = r.day;
    const base = byDay.get(day) ?? { day, label: niceDayLabel(day) };
    const isTop = topKeys.has(r.groupKey);

    const safeKey = (r.groupKey || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    if (isTop) {
      base[`sessions_${safeKey}`] = (base[`sessions_${safeKey}`] ?? 0) + (r.sessions ?? 0);
    } else {
      base["sessions_other"] = (base["sessions_other"] ?? 0) + (r.sessions ?? 0);
    }

    byDay.set(day, base);
  }

  const points = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));

  // 3) Render lines
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tickMargin={8} />
        <YAxis width={36} />
        <Tooltip />
        <Legend />

        {top.map((t) => {
          const safeKey = t.key.replace(/[^a-zA-Z0-9_-]/g, "_");
          return (
            <Line
              key={t.key}
              type="monotone"
              dataKey={`sessions_${safeKey}`}
              name={t.label}
              strokeWidth={2}
              dot={false}
            />
          );
        })}

        {/* Other */}
        <Line
          type="monotone"
          dataKey="sessions_other"
          name="Other"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
