"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

type Row = {
  territoryKey: string;
  territoryLabel: string;
  sessions: number;
  conversations: number;
  meetings: number;
  experiences?: number;
  inbound_requests?: number;
};

type ChartRow = {
  name: string;
  sessions: number;
  meetings: number;
};

const fmtNumber = (v: unknown) => Number(v ?? 0).toLocaleString();

export function TerritoryBarChart({ data }: { data: Row[] }) {
  const rows: ChartRow[] = (Array.isArray(data) ? data : [])
    .slice()
    .sort((a, b) => Number(b.sessions ?? 0) - Number(a.sessions ?? 0))
    .slice(0, 10)
    .map((r) => ({
      name: (r.territoryLabel || r.territoryKey || "Unknown").toString(),
      sessions: Number(r.sessions ?? 0),
      meetings: Number(r.meetings ?? 0),
    }));

  if (!rows.length) {
    return <div className="text-sm text-muted-foreground">No data yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tickMargin={8} />
        <YAxis width={40} tickFormatter={fmtNumber} />
        <Tooltip
          formatter={(value) => fmtNumber(value)}
          labelFormatter={(label) => String(label ?? "")}
        />
        <Legend />
        <Bar dataKey="sessions" />
        <Bar dataKey="meetings" />
      </BarChart>
    </ResponsiveContainer>
  );
}
