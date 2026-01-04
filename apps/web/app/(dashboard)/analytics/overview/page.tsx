"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";

import { useEntitlements } from "@/modules/billing/hooks/use-entitlements";

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

function makeRange(days: number) {
  const toTs = Date.now();
  const fromTs = toTs - days * 24 * 60 * 60 * 1000;
  return { fromTs, toTs };
}

function niceDayLabel(day: string) {
  const parts = day.split("-");
  if (parts.length !== 3) return day;
  return `${parts[1]}/${parts[2]}`;
}

function RangePills({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const opts = [7, 30, 90];
  return (
    <div className="inline-flex rounded-xl border bg-white p-1 shadow-sm">
      {opts.map((d) => {
        const active = d === value;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={[
              "px-3 py-1.5 text-sm rounded-lg transition",
              active ? "bg-black text-white" : "text-muted-foreground hover:bg-accent",
            ].join(" ")}
          >
            {d}d
          </button>
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  delta,
  sub,
}: {
  label: string;
  value: number;
  delta?: number | null;
  sub?: string;
}) {
  const d = typeof delta === "number" ? delta : null;
  const sign = d !== null && d > 0 ? "+" : "";
  const pct = d !== null ? `${sign}${Math.round(d * 100)}%` : null;

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-4xl font-semibold mt-2">{(value ?? 0).toLocaleString()}</div>
          {sub ? <div className="mt-2 text-xs text-muted-foreground">{sub}</div> : null}
        </div>
        {pct ? (
          <div className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            vs prev: {pct}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CardShell({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function MiniTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-12 gap-3 border-b bg-muted/30 px-4 py-2 text-xs uppercase text-muted-foreground">
        <div className="col-span-5">{columns[0]}</div>
        <div className="col-span-7">{columns[1]}</div>
      </div>
      <div className="divide-y">
        {rows.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">No data yet.</div>
        ) : (
          rows.map((r, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-3 px-4 py-3 text-sm">
              <div className="col-span-5 font-medium truncate">{r[0]}</div>
              <div className="col-span-7 text-muted-foreground">{r[1]}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function AnalyticsOverviewPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const ent = useEntitlements();
  const advancedEnabled = !!ent.features.canUseAdvancedAnalytics;

  const [days, setDays] = useState(30);
  const { fromTs, toTs } = useMemo(() => makeRange(days), [days]);

  const overview = useQuery(
    api.public.analytics.overview,
    orgId
      ? {
          organizationId: orgId,
          fromTs,
          toTs,
          ...(advancedEnabled ? { slaSeconds: 120 } : {}),
        }
      : "skip",
  );

  const trends = useQuery(
    api.public.analytics.trends,
    orgId ? { organizationId: orgId, fromTs, toTs } : "skip",
  );

  // ✅ IMPORTANT: On ne charge repsLeaderboard que si Advanced
  const reps = useQuery(
    api.public.analytics.repsLeaderboard,
    orgId && advancedEnabled
      ? ({
          organizationId: orgId,
          fromTs,
          toTs,
          slaSeconds: 120,
        } as any)
      : "skip",
  );

  if (!orgId) return <div className="p-6">No organization</div>;
  if (overview === undefined || trends === undefined || (advancedEnabled && reps === undefined))
    return <div className="p-6">Loading…</div>;

  const kpi = overview?.kpi ?? {};
  const deltas = overview?.deltas ?? {};

  const cards: Array<{ label: string; value: number; delta?: number | null; sub?: string }> = [
    { label: "Sessions", value: Number(kpi.sessions ?? 0), delta: deltas.sessions ?? null, sub: "Top-of-funnel traffic" },
    { label: "Experience shown", value: Number(kpi.experiences ?? 0), delta: deltas.experiences ?? null, sub: "Widget exposure" },
    { label: "Inbound chat requested", value: Number(kpi.inboundRequests ?? 0), delta: deltas.inboundRequests ?? null, sub: "High intent moments" },
    { label: "Conversations", value: Number(kpi.conversations ?? 0), delta: deltas.conversations ?? null, sub: "Qualified engagement" },
    { label: "Meetings booked", value: Number(kpi.meetings ?? 0), delta: deltas.meetings ?? null, sub: "Business outcomes" },
  ];

  const topSources = Array.isArray(overview?.top_sources) ? overview.top_sources : [];
  const topPages = Array.isArray(overview?.top_pages) ? overview.top_pages : [];
  const topTerritories = Array.isArray(overview?.top_territories) ? overview.top_territories : [];

  const trendRows = (Array.isArray(trends) ? trends : []).map((r: any) => ({
    day: niceDayLabel(String(r.day)),
    sessions: Number(r.sessions ?? 0),
    conversations: Number(r.conversations ?? 0),
    meetings: Number(r.meetings ?? 0),
  }));

  const inboundStat = reps?.inboundStats ?? null;
  const repRows = Array.isArray(reps?.reps) ? reps.reps : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-2xl font-semibold">Executive Analytics</div>
          <div className="text-sm text-muted-foreground">
            Pipeline performance for the selected period.
          </div>
        </div>
        <RangePills value={days} onChange={setDays} />
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} delta={c.delta} sub={c.sub} />
        ))}
      </div>

      {/* ✅ Starter voit uniquement la Trend */}
      <div className="grid gap-4 grid-cols-1">
        <CardShell
          title="Pipeline trend"
          subtitle="Sessions → Conversations → Meetings over time"
          right={<div className="rounded-full border px-3 py-1 text-xs font-medium">Core</div>}
        >
          {trendRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No trend data yet.</div>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendRows} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickMargin={8} />
                  <YAxis width={42} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="sessions" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="conversations" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="meetings" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardShell>
      </div>

      {/* ✅ Advanced only: inbound speed + attribution + reps */}
      {advancedEnabled ? (
        <>
          <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
            <CardShell
              title="Inbound response speed"
              subtitle="How fast reps start after inbound request (SLA-ready)"
              right={<div className="rounded-full border px-3 py-1 text-xs font-medium">Advanced</div>}
            >
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Median</div>
                    <div className="mt-1 text-xl font-semibold tabular-nums">
                      {inboundStat?.median_sec ?? "—"}s
                    </div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">p90</div>
                    <div className="mt-1 text-xl font-semibold tabular-nums">
                      {inboundStat?.p90_sec ?? "—"}s
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">Within SLA rate</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">
                    {typeof inboundStat?.within_sla_rate === "number"
                      ? `${Math.round(inboundStat.within_sla_rate * 100)}%`
                      : "—"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    SLA: {inboundStat?.slaSeconds ?? 120}s
                  </div>
                </div>
              </div>
            </CardShell>
          </div>

          <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <CardShell title="Attribution & territories" subtitle="What drives pipeline outcomes">
                <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 text-sm font-medium">Top sources</div>
                    <MiniTable
                      columns={["Source", "Sessions • Conversations • Meetings"]}
                      rows={topSources.slice(0, 8).map((s: any) => [
                        String(s.source ?? "direct"),
                        `${Number(s.sessions ?? 0).toLocaleString()} • ${Number(s.conversations ?? 0).toLocaleString()} • ${Number(s.meetings ?? 0).toLocaleString()}`,
                      ])}
                    />
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-medium">Top pages</div>
                    <MiniTable
                      columns={["Page", "Sessions • Conversations • Meetings"]}
                      rows={topPages.slice(0, 8).map((p: any) => [
                        String(p.page ?? "/"),
                        `${Number(p.sessions ?? 0).toLocaleString()} • ${Number(p.conversations ?? 0).toLocaleString()} • ${Number(p.meetings ?? 0).toLocaleString()}`,
                      ])}
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 text-sm font-medium">Top territories</div>
                  <MiniTable
                    columns={["Territory", "Sessions • Conversations • Meetings"]}
                    rows={topTerritories.slice(0, 8).map((t: any) => [
                      String(t.territoryLabel ?? t.territoryKey ?? "Unknown"),
                      `${Number(t.sessions ?? 0).toLocaleString()} • ${Number(t.conversations ?? 0).toLocaleString()} • ${Number(t.meetings ?? 0).toLocaleString()}`,
                    ])}
                  />
                </div>
              </CardShell>
            </div>

            <CardShell title="Top reps impact" subtitle="Who converts inbound into meetings">
              {repRows.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No rep events tracked yet. (This fills when you log rep actions with `userId`.)
                </div>
              ) : (
                <div className="space-y-2">
                  {repRows.slice(0, 8).map((r: any) => (
                    <div key={r.repUserId} className="flex items-center justify-between rounded-xl border p-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.name ?? "Rep"}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.title ?? "—"}</div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <div className="text-right">
                          <div className="font-semibold tabular-nums">{Number(r.meetings ?? 0).toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">meetings</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold tabular-nums">{Number(r.rep_started ?? 0).toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">started</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardShell>
          </div>
        </>
      ) : null}
    </div>
  );
}
