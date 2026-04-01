// ✅ FILE: app/(app)/analytics/overview/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

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

import { BrandPill, RangePills, CardShell, StatCard, MiniTable } from "@/modules/analytics/shared/analytics-primitives";

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

function normalizeLabel(s: any) {
  const v = String(s ?? "").trim();
  if (!v) return "Unattributed";
  const lower = v.toLowerCase();
  if (lower === "unknown") return "Unattributed";
  if (lower === "other") return "Other";
  return v;
}

export default function AnalyticsOverviewPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  // For client demo: hide "Core/Advanced" pills.
  // Add `?showPlanBadges=1` in the URL to re-enable them (internal demo/debug).
  const searchParams = useSearchParams();
  const showPlanBadges = searchParams.get("showPlanBadges") === "1";

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

  const kpi = (overview?.kpi ?? {}) as Record<string, number | undefined>;
  const deltas = (overview?.deltas ?? {}) as Record<string, number | null | undefined>;

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
  const topCountries = Array.isArray((overview as any)?.top_countries) ? (overview as any).top_countries : [];
  const useCountriesTable = topCountries.length > 0;
  const topTerritoriesCountryCodes = Array.isArray((overview as any)?.top_territories_countryCodes)
    ? (overview as any).top_territories_countryCodes
    : [];

  const [selectedZoneTerritoryKey, setSelectedZoneTerritoryKey] = useState<string>("");

  const isWholeWorldTerritory = (t: any) => {
    const key = String(t?.territoryKey ?? "").toLowerCase();
    const label = String(t?.territoryLabel ?? "").toLowerCase();
    return key === "whole_world" || (label.includes("whole") && label.includes("world"));
  };

  const zoneTerritories = useMemo(
    () => topTerritories.filter((t: any) => !isWholeWorldTerritory(t)).slice(0, 4),
    [topTerritories],
  );
  const zoneTerritoriesWithCountries = useMemo(() => {
    if (!useCountriesTable) return [];
    const keyToCodes = new Map<string, string[]>(
      topTerritoriesCountryCodes.map((t: any) => [
        String(t.territoryKey),
        Array.isArray(t.countryCodes) ? t.countryCodes.map((c: any) => String(c).toUpperCase()) : [],
      ]),
    );
    return zoneTerritories.filter((z: any) => {
      const codes = keyToCodes.get(String(z.territoryKey)) ?? [];
      return codes.length > 0;
    });
  }, [useCountriesTable, zoneTerritories, topTerritoriesCountryCodes]);

  const canShowZoneDrilldown = useCountriesTable && zoneTerritoriesWithCountries.length > 0;

  // Init selection when data arrives.
  useEffect(() => {
    if (!selectedZoneTerritoryKey && zoneTerritoriesWithCountries.length > 0) {
      const k = zoneTerritoriesWithCountries[0]?.territoryKey;
      if (k) setSelectedZoneTerritoryKey(String(k));
    }
  }, [selectedZoneTerritoryKey, zoneTerritoriesWithCountries]);

  const terrKeyToCountryCodes = new Map<string, string[]>(
    topTerritoriesCountryCodes.map((t: any) => [String(t.territoryKey), (t.countryCodes ?? []).map((c: any) => String(c).toUpperCase())]),
  );

  const selectedCountryCodes = selectedZoneTerritoryKey
    ? terrKeyToCountryCodes.get(selectedZoneTerritoryKey)
    : undefined;
  const selectedCountryCodeSet =
    selectedCountryCodes && selectedCountryCodes.length > 0
      ? new Set(selectedCountryCodes.map((c) => String(c).toUpperCase()))
      : null;

  const countriesInSelectedZone =
    useCountriesTable && selectedCountryCodeSet
      ? topCountries.filter((c: any) => selectedCountryCodeSet.has(String(c.countryCode).toUpperCase()))
      : [];

  const trendRows = (Array.isArray(trends) ? trends : []).map((r: any) => ({
    day: niceDayLabel(String(r.day)),
    sessions: Number(r.sessions ?? 0),
    conversations: Number(r.conversations ?? 0),
    meetings: Number(r.meetings ?? 0),
  }));

  const repRows = Array.isArray(reps?.reps) ? reps.reps : [];

  // Keep guard returns AFTER all hooks are declared,
  // otherwise React can throw hook order errors in production.
  if (!orgId) return <div className="p-6">No organization</div>;
  if (overview === undefined || trends === undefined || (advancedEnabled && reps === undefined))
    return <div className="p-6">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl space-y-2">
          <div className="text-2xl font-semibold">Executive Analytics</div>
          <div className="text-sm text-muted-foreground">Pipeline performance for the selected period.</div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Different from web analytics</span> (e.g. Vercel or GA on your
            marketing site): those tools measure page traffic. This view measures your{" "}
            <span className="font-medium text-foreground">Inboundless funnel</span> — sessions, conversations, and
            meetings from the widget on <span className="font-medium text-foreground">your customers&apos; sites</span>,
            broken down by source, page, and geography (and optionally by sales territory below).
          </p>
        </div>
        <RangePills value={days} onChange={setDays} />
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} delta={c.delta} sub={c.sub} />
        ))}
      </div>

      <div className="grid gap-4 grid-cols-1">
        <CardShell
          title="Pipeline trend"
          subtitle="Sessions → Conversations → Meetings over time"
          right={showPlanBadges ? <BrandPill>Core</BrandPill> : null}
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
                  <Line type="monotone" dataKey="sessions" dot={false} stroke="#a855f7" strokeWidth={2} />
                  <Line type="monotone" dataKey="conversations" dot={false} stroke="#ec4899" strokeWidth={2} />
                  <Line type="monotone" dataKey="meetings" dot={false} stroke="#f43f5e" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardShell>
      </div>

      {advancedEnabled ? (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <CardShell
              title="Attribution & territories"
              subtitle="Widget pipeline — not your hosting provider’s page analytics"
              right={showPlanBadges ? <BrandPill>Advanced</BrandPill> : null}
            >
              <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm font-medium">Top sources</div>
                  <MiniTable
                    columns={["Source", "Sessions • Conversations • Meetings"]}
                    rows={topSources.slice(0, 8).map((s: any) => [
                      normalizeLabel(s.source ?? "direct"),
                      `${Number(s.sessions ?? 0).toLocaleString()} • ${Number(s.conversations ?? 0).toLocaleString()} • ${Number(s.meetings ?? 0).toLocaleString()}`,
                    ])}
                  />
                </div>

                <div>
                  <div className="mb-2 text-sm font-medium">Top pages</div>
                  <MiniTable
                    columns={["Page", "Sessions • Conversations • Meetings"]}
                    rows={topPages.slice(0, 8).map((p: any) => [
                      normalizeLabel(p.page ?? "/"),
                      `${Number(p.sessions ?? 0).toLocaleString()} • ${Number(p.conversations ?? 0).toLocaleString()} • ${Number(p.meetings ?? 0).toLocaleString()}`,
                    ])}
                  />
                </div>
              </div>

              <div className="mt-4 space-y-8">
                {/* 1) Marketing-style global geography — all visitors we can place on the map; not filtered by sales territories */}
                {useCountriesTable ? (
                  <div className="space-y-2">
                    <div>
                      <div className="text-sm font-medium">Where your visitors come from</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Marketing view: worldwide visitor geography for the selected period (top countries by activity).
                        Not tied to <span className="font-medium text-foreground">Team &amp; Territories</span> — that’s
                        for sales routing below.
                      </p>
                    </div>
                    <MiniTable
                      columns={["Country", "Sessions • Conversations • Meetings"]}
                      rows={topCountries.slice(0, 8).map((t: any) => [
                        normalizeLabel(t.countryLabel ?? t.countryCode),
                        `${Number(t.sessions ?? 0).toLocaleString()} • ${Number(t.conversations ?? 0).toLocaleString()} • ${Number(t.meetings ?? 0).toLocaleString()}`,
                      ])}
                    />
                    <p className="text-xs text-muted-foreground">
                      “Unattributed” means we couldn’t infer a country for some visits (network, privacy, or missing
                      location signal) — not a sales territory issue.
                    </p>
                  </div>
                ) : null}

                {/* 2) Sales territory drill-down — same data filtered by configured territory country lists */}
                {canShowZoneDrilldown ? (
                  <div className="space-y-3 border-t border-border/60 pt-6">
                    <div>
                      <div className="text-sm font-medium">By sales territory</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Uses your <span className="font-medium text-foreground">Team &amp; Territories</span> definitions.
                        Shows performance inside each zone (e.g. which countries in “Europe” matter for routing), not total
                        global traffic.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {zoneTerritoriesWithCountries.map((z: any) => {
                        const active = String(z.territoryKey) === selectedZoneTerritoryKey;
                        return (
                          <button
                            key={z.territoryKey}
                            type="button"
                            onClick={() => setSelectedZoneTerritoryKey(String(z.territoryKey))}
                            className={[
                              "rounded-full border px-3 py-1 text-xs font-semibold transition",
                              active
                                ? "bg-gradient-to-r from-fuchsia-600 to-rose-500 border-fuchsia-200 text-white"
                                : "bg-white border-slate-200 text-muted-foreground hover:bg-fuchsia-50/40 hover:text-foreground",
                            ].join(" ")}
                          >
                            {z.territoryLabel ?? z.territoryKey}
                          </button>
                        );
                      })}
                    </div>

                    <div className="text-sm font-medium">
                      Countries in{" "}
                      {zoneTerritoriesWithCountries.find(
                        (z: any) => String(z.territoryKey) === selectedZoneTerritoryKey,
                      )?.territoryLabel ?? selectedZoneTerritoryKey}
                    </div>
                    <MiniTable
                      columns={["Country", "Sessions • Conversations • Meetings"]}
                      rows={countriesInSelectedZone.slice(0, 8).map((t: any) => [
                        normalizeLabel(t.countryLabel ?? t.countryCode),
                        `${Number(t.sessions ?? 0).toLocaleString()} • ${Number(t.conversations ?? 0).toLocaleString()} • ${Number(t.meetings ?? 0).toLocaleString()}`,
                      ])}
                    />
                    {countriesInSelectedZone.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No attributed traffic in this territory for the period (or geo missing for those visits).
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* Fallback: no country-level geo yet — show territory rollup only */}
                {!useCountriesTable ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Top territories</div>
                    <p className="text-xs text-muted-foreground">
                      Country-level “where visitors come from” will show once we can attribute visits to a country for this
                      period.
                    </p>
                    <MiniTable
                      columns={["Territory", "Sessions • Conversations • Meetings"]}
                      rows={topTerritories.slice(0, 8).map((t: any) => [
                        normalizeLabel(t.territoryLabel ?? t.territoryKey),
                        `${Number(t.sessions ?? 0).toLocaleString()} • ${Number(t.conversations ?? 0).toLocaleString()} • ${Number(t.meetings ?? 0).toLocaleString()}`,
                      ])}
                    />
                  </div>
                ) : null}
              </div>
            </CardShell>
          </div>

          <CardShell
            title="Top reps impact"
            subtitle="Who converts inbound into meetings"
            right={showPlanBadges ? <BrandPill>Advanced</BrandPill> : null}
          >
            {repRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No rep events tracked yet. (This fills when you log rep actions with `userId`.)
              </div>
            ) : (
              <div className="space-y-2">
                {repRows.slice(0, 8).map((r: any) => (
                  <div
                    key={r.repUserId}
                    className="flex items-center justify-between rounded-xl border p-3 transition hover:border-fuchsia-200 hover:bg-fuchsia-50/40"
                  >
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
      ) : null}
    </div>
  );
}