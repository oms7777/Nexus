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

export function TerritoryBarChart({ data }: { data: Row[] }) {
  const rows = (data ?? [])
    .slice()
    .sort((a, b) => (b.sessions ?? 0) - (a.sessions ?? 0))
    .slice(0, 10)
    .map((r) => ({
      name: r.territoryLabel || r.territoryKey,
      sessions: r.sessions ?? 0,
      meetings: r.meetings ?? 0,
    }));

  if (!rows.length) {
    return <div className="text-sm text-muted-foreground">No data yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tickMargin={8} />
        <YAxis width={36} />
        <Tooltip />
        <Legend />
        <Bar dataKey="sessions" />
        <Bar dataKey="meetings" />
      </BarChart>
    </ResponsiveContainer>
  );
}
