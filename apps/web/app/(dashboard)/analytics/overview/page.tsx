// apps/web/app/(dashboard)/analytics/overview/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";

import { TerritoryBarChart } from "@/modules/analytics/overview/components/TerritoryBarChart";

function makeRange(days: number) {
  const toTs = Date.now();
  const fromTs = toTs - days * 24 * 60 * 60 * 1000;
  return { fromTs, toTs };
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
}: {
  label: string;
  value: number;
  delta?: number | null;
}) {
  const d = typeof delta === "number" ? delta : null;
  const sign = d !== null && d > 0 ? "+" : "";
  const pct = d !== null ? `${sign}${Math.round(d * 100)}%` : null;

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-4xl font-semibold mt-2">{(value ?? 0).toLocaleString()}</div>
      {pct ? <div className="mt-2 text-xs text-muted-foreground">vs previous period: {pct}</div> : null}
    </div>
  );
}

function LockedAdvancedCard() {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">Advanced Analytics</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Unlock territory breakdown & attribution leaderboards.
          </div>
        </div>
        <div className="rounded-full border px-3 py-1 text-xs font-medium">Locked</div>
      </div>

      <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
        <div>• Territory breakdown (sessions + meetings)</div>
        <div>• Top sources & top pages</div>
        <div>• Advanced inbound response metrics</div>
      </div>

      <div className="mt-6 rounded-xl bg-muted p-4 text-sm">
        Enable <span className="font-medium">Advanced Analytics</span> in your plan/add-on to view this section.
      </div>
    </div>
  );
}

function CardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Table({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-12 gap-3 border-b bg-muted/30 px-4 py-2 text-xs uppercase text-muted-foreground">
        {columns.map((c, i) => (
          <div key={i} className={i === 0 ? "col-span-5" : "col-span-7"}>
            {c}
          </div>
        ))}
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

  const [days, setDays] = useState(30);
  const { fromTs, toTs } = useMemo(() => makeRange(days), [days]);

  const entitlements = useQuery(api.public.entitlements.getEntitlements, orgId ? {} : "skip");
  const advancedEnabled = !!entitlements?.features?.canUseAdvancedAnalytics;

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

  if (!orgId) return <div className="p-6">No organization</div>;
  if (overview === undefined) return <div className="p-6">Loading…</div>;

  const kpi = overview?.kpi ?? {};
  const deltas = overview?.deltas ?? {};

  const cards: Array<{ label: string; value: number; delta?: number | null }> = [
    { label: "Sessions", value: Number(kpi.sessions ?? 0), delta: deltas.sessions ?? null },
    { label: "Experience shown", value: Number(kpi.experiences ?? 0), delta: deltas.experiences ?? null },
    { label: "Inbound chat requested", value: Number(kpi.inboundRequests ?? 0), delta: deltas.inboundRequests ?? null },
    { label: "Conversations", value: Number(kpi.conversations ?? 0), delta: deltas.conversations ?? null },
    { label: "Meetings booked", value: Number(kpi.meetings ?? 0), delta: deltas.meetings ?? null },
  ];

  const topSources = Array.isArray(overview?.top_sources) ? overview.top_sources : [];
  const topPages = Array.isArray(overview?.top_pages) ? overview.top_pages : [];
  const topTerritories = Array.isArray(overview?.top_territories) ? overview.top_territories : [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-semibold">Analytics</div>
          <div className="text-sm text-muted-foreground">Overview of widget activity for the selected period.</div>
        </div>
        <RangePills value={days} onChange={setDays} />
      </div>

      {/* Core analytics */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} delta={c.delta} />
        ))}
      </div>

      {/* Advanced analytics */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Advanced Analytics</div>
          <div className="text-xs text-muted-foreground">{advancedEnabled ? "Enabled" : "Add-on required"}</div>
        </div>

        {!advancedEnabled ? (
          <LockedAdvancedCard />
        ) : (
          <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
            <CardShell title="Territory breakdown" subtitle="Top territories by sessions + meetings">
              <div className="h-[280px]">
                <TerritoryBarChart data={topTerritories as any} />
              </div>
            </CardShell>

            <CardShell title="Attribution — Top sources" subtitle="Where your sessions & meetings come from">
              <Table
                columns={["Source", "Sessions • Conversations • Meetings"]}
                rows={topSources.slice(0, 8).map((s: any) => [
                  String(s.source ?? "direct"),
                  `${Number(s.sessions ?? 0).toLocaleString()} • ${Number(s.conversations ?? 0).toLocaleString()} • ${Number(s.meetings ?? 0).toLocaleString()}`,
                ])}
              />

              <div className="mt-4" />

              <Table
                columns={["Top pages", "Sessions • Conversations • Meetings"]}
                rows={topPages.slice(0, 8).map((p: any) => [
                  String(p.page ?? "/"),
                  `${Number(p.sessions ?? 0).toLocaleString()} • ${Number(p.conversations ?? 0).toLocaleString()} • ${Number(p.meetings ?? 0).toLocaleString()}`,
                ])}
              />
            </CardShell>
          </div>
        )}
      </div>
    </div>
  );
}
