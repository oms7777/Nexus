"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";

// ✅ tes composants
import { TerritoryBarChart } from "@/modules/analytics/overview/components/TerritoryBarChart";
import { TimeseriesTerritoryMultiLineChart } from "@/modules/analytics/overview/components/TimeseriesTerritoryMultiLineChart";

function makeRange(days: number) {
  const toTs = Date.now();
  const fromTs = toTs - days * 24 * 60 * 60 * 1000;
  return { fromTs, toTs };
}

function RangePills({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-4xl font-semibold mt-2">{value.toLocaleString()}</div>
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
            Unlock charts, territory breakdown, and trend lines.
          </div>
        </div>
        <div className="rounded-full border px-3 py-1 text-xs font-medium">Locked</div>
      </div>

      <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
        <div>• Timeseries multi-lines (by territory)</div>
        <div>• Territory breakdown (sessions + meetings)</div>
        <div>• Signals enrichment (utm, geo, engagement)</div>
      </div>

      <div className="mt-6 rounded-xl bg-muted p-4 text-sm">
        Enable <span className="font-medium">Advanced Analytics</span> in your plan/add-on to
        view this section.
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
      <div className="mt-3 h-[280px]">{children}</div>
    </div>
  );
}

export default function AnalyticsOverviewPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const [days, setDays] = useState(30);
  const { fromTs, toTs } = useMemo(() => makeRange(days), [days]);

  // Core
  const overview = useQuery(
    api.public.analytics.overview,
    orgId ? { organizationId: orgId, fromTs, toTs } : "skip",
  );

  // ✅ gating via entitlements (source de vérité)
  const entitlements = useQuery(api.public.entitlements.getEntitlements, orgId ? {} : "skip");

  // Option plan-based (comme ton computeEntitlements actuel)
  const advancedEnabled = !!entitlements?.features?.canUseAdvancedAnalytics;

  // Advanced datasets (only if enabled)
  const territory = useQuery(
    api.public.analytics.territoryBreakdown,
    orgId && advancedEnabled ? { organizationId: orgId, fromTs, toTs } : "skip",
  );

  // ✅ multi-lines par territory
  const timeseriesTerritory = useQuery(
    api.public.analytics.timeseries,
    orgId && advancedEnabled
      ? { organizationId: orgId, fromTs, toTs, groupBy: "territory" }
      : "skip",
  );

  if (!orgId) return <div className="p-6">No organization</div>;
  if (overview === undefined) return <div className="p-6">Loading…</div>;

  const cards: Array<[string, number]> = [
    ["Sessions", overview.sessions],
    ["Received an Experience", overview.experiences],
    ["Inbound Chat Requested", overview.inbound_requests],
    ["Pounce Attempts", overview.pounce_attempts],
    ["Conversations", overview.conversations],
    ["Meetings Booked", overview.meetings],
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-semibold">Analytics</div>
          <div className="text-sm text-muted-foreground">
            Overview of your widget activity for the selected period.
          </div>
        </div>
        <RangePills value={days} onChange={setDays} />
      </div>

      {/* Core analytics */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value]) => (
          <StatCard key={label} label={label} value={value} />
        ))}
      </div>

      {/* Advanced analytics */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Advanced Analytics</div>
          <div className="text-xs text-muted-foreground">
            {advancedEnabled ? "Enabled" : "Add-on required"}
          </div>
        </div>

        {!advancedEnabled ? (
          <LockedAdvancedCard />
        ) : (
          <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
            <CardShell
              title="Timeseries — Multi-lines by territory"
              subtitle="Sessions / Conversations / Meetings grouped by territory"
            >
              {timeseriesTerritory === undefined ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : (
                <TimeseriesTerritoryMultiLineChart data={timeseriesTerritory ?? []} />
              )}
            </CardShell>

            <CardShell
              title="Territory breakdown"
              subtitle="Top territories by sessions + meetings"
            >
              {territory === undefined ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : (
                <TerritoryBarChart data={territory ?? []} />
              )}
            </CardShell>
          </div>
        )}
      </div>
    </div>
  );
}
