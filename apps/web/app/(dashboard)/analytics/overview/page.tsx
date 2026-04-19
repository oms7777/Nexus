// ✅ FILE: app/(app)/analytics/overview/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";

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

import {
  BrandPill,
  CardShell,
  StatCard,
  MiniBarTable,
  DeltaPill,
  GeoKpiTable,
} from "@/modules/analytics/shared/analytics-primitives";
import {
  AnalyticsDateRangePicker,
  rangeToTimestamps,
  type AnalyticsRange,
} from "@/modules/analytics/shared/analytics-date-range";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";

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

function normalizeSourceLabel(raw: any) {
  const v = normalizeLabel(raw);
  const lower = v.toLowerCase();
  if (lower === "direct") return "Direct / Unattributed";
  if (lower === "google_ads") return "Google Ads";
  if (lower === "meta_ads") return "Meta Ads";
  if (lower === "microsoft_ads") return "Microsoft Ads";
  if (lower === "linkedin_ads") return "LinkedIn Ads";
  if (/(^|\\.)google\\./.test(lower)) return "Google";
  if (lower === "t.co" || lower.includes("twitter.com") || lower.includes("x.com")) return "X (Twitter)";
  if (lower.includes("linkedin.com")) return "LinkedIn";
  if (lower.includes("facebook.com") || lower.includes("l.facebook.com") || lower.includes("m.facebook.com"))
    return "Facebook";
  if (lower.includes("instagram.com")) return "Instagram";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "YouTube";
  if (lower.includes("bing.com")) return "Bing";
  if (lower.includes("reddit.com")) return "Reddit";
  return v;
}

function isUnknownCountryRow(c: any) {
  return String(c?.countryCode ?? "").toUpperCase() === "UNKNOWN";
}

/** Dev / loopback hosts — not useful in “where did traffic come from” for prod. */
function isNoiseSourceRow(s: any) {
  const v = String(s?.source ?? "").toLowerCase();
  return v === "localhost" || v.startsWith("127.") || v === "0.0.0.0" || v === "::1";
}

/**
 * Short takeaway only when it adds something vs. the table (skip “100% from one country”).
 */
function buildGeoInsight(topCountries: any[]): string | null {
  if (!Array.isArray(topCountries) || topCountries.length === 0) return null;
  const totalMeetings = topCountries.reduce((s, c) => s + Number(c.meetings ?? 0), 0);
  const totalConv = topCountries.reduce((s, c) => s + Number(c.conversations ?? 0), 0);

  if (totalMeetings > 0) {
    const withMeetings = topCountries.filter((c) => Number(c.meetings ?? 0) > 0);
    if (withMeetings.length < 2) return null;
    const sorted = [...topCountries].sort((a, b) => Number(b.meetings ?? 0) - Number(a.meetings ?? 0));
    const top3 = sorted.slice(0, 3).filter((c) => Number(c.meetings ?? 0) > 0);
    if (top3.length === 0) return null;
    const sumTop3 = top3.reduce((s, c) => s + Number(c.meetings ?? 0), 0);
    const pct = Math.round((sumTop3 / totalMeetings) * 100);
    const names = top3.map((c) => normalizeLabel(c.countryLabel ?? c.countryCode)).join(", ");
    return `${pct}% of meetings are concentrated in: ${names}.`;
  }
  if (totalConv > 0) {
    const withConv = topCountries.filter((c) => Number(c.conversations ?? 0) > 0);
    if (withConv.length < 2) return null;
    const sorted = [...topCountries].sort((a, b) => Number(b.conversations ?? 0) - Number(a.conversations ?? 0));
    const top3 = sorted.slice(0, 3).filter((c) => Number(c.conversations ?? 0) > 0);
    if (top3.length === 0) return null;
    const sumTop3 = top3.reduce((s, c) => s + Number(c.conversations ?? 0), 0);
    const pct = Math.round((sumTop3 / totalConv) * 100);
    const names = top3.map((c) => normalizeLabel(c.countryLabel ?? c.countryCode)).join(", ");
    return `${pct}% of conversations are concentrated in: ${names}.`;
  }
  return null;
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

  const [range, setRange] = useState<AnalyticsRange>({ kind: "preset", days: 30 });
  const { fromTs, toTs } = useMemo(() => rangeToTimestamps(range), [range]);

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

  const meetingsN = Number(kpi.meetings ?? 0);
  const sessionsN = Number(kpi.sessions ?? 0);
  const conversationsN = Number(kpi.conversations ?? 0);
  const sessionToMtgPct = sessionsN > 0 ? (meetingsN / sessionsN) * 100 : 0;
  const convToMtgPct = conversationsN > 0 ? (meetingsN / conversationsN) * 100 : 0;

  const topSources = Array.isArray(overview?.top_sources) ? overview.top_sources : [];
  const topSourcesDisplay = useMemo(() => topSources.filter((s: any) => !isNoiseSourceRow(s)), [topSources]);
  const topPages = Array.isArray(overview?.top_pages) ? overview.top_pages : [];
  const topTerritories = Array.isArray(overview?.top_territories) ? overview.top_territories : [];
  const topCountries = Array.isArray((overview as any)?.top_countries) ? (overview as any).top_countries : [];
  const unknownCountryRow = useMemo(
    () => topCountries.find((c: any) => isUnknownCountryRow(c)),
    [topCountries],
  );
  const topCountriesKnown = useMemo(
    () => topCountries.filter((c: any) => !isUnknownCountryRow(c)),
    [topCountries],
  );
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

  const geoInsight = useMemo(() => buildGeoInsight(topCountriesKnown), [topCountriesKnown]);

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
        <div className="max-w-2xl space-y-2">
          <div className="text-2xl font-semibold tracking-tight">Executive Analytics</div>
          <p className="text-sm text-muted-foreground">
            Pipeline &amp; outcomes from the Inboundless widget on your sites — complementary to GA / ads tools for
            acquisition detail.
          </p>
          <p className="text-xs text-muted-foreground/90">
            <span className="font-medium text-foreground">Everyone in your organization</span> sees the same numbers
            here. Geography tabs below are views of the same data — global vs. your sales zones in Team &amp; Territories.
          </p>
        </div>
        <AnalyticsDateRangePicker value={range} onChange={setRange} />
      </div>

      {/* Hero: primary business outcome — refonte focus */}
      <div className="overflow-hidden rounded-2xl border border-fuchsia-200/50 bg-gradient-to-br from-fuchsia-50/90 via-white to-rose-50/60 shadow-sm ring-1 ring-black/[0.04] dark:border-fuchsia-900/30 dark:from-fuchsia-950/25 dark:via-background dark:to-rose-950/20 dark:ring-white/10">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
          <div className="min-w-0 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-800/90 dark:text-fuchsia-300/90">
              Primary outcome
            </p>
            <div className="flex flex-wrap items-end gap-3 gap-y-1">
              <span className="text-5xl font-bold tracking-tight tabular-nums text-foreground sm:text-6xl">
                {meetingsN.toLocaleString()}
              </span>
              <span className="pb-1 text-lg font-medium text-muted-foreground">meetings booked</span>
              <DeltaPill delta={deltas.meetings ?? null} className="mb-1" />
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Booked meetings attributed to this period. Conversion rates summarize how efficiently sessions and
              conversations turn into outcomes — not raw marketing traffic.
            </p>
          </div>
          <div className="grid w-full max-w-md shrink-0 grid-cols-3 gap-2 sm:gap-3 lg:max-w-lg">
            <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-3 shadow-sm dark:border-border dark:bg-card/95">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Session → meeting</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{sessionToMtgPct.toFixed(1)}%</div>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-3 shadow-sm dark:border-border dark:bg-card/95">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Conv. → meeting</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{convToMtgPct.toFixed(1)}%</div>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-3 shadow-sm dark:border-border dark:bg-card/95">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Sessions</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{sessionsN.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="px-0.5">
          <h2 className="text-sm font-semibold text-foreground">Pipeline volume</h2>
          <p className="text-xs text-muted-foreground">Funnel counts for the selected period — compare to prior below.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {cards.map((c) => (
            <StatCard key={c.label} label={c.label} value={c.value} delta={c.delta} sub={c.sub} />
          ))}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1">
        <CardShell
          title="Pipeline trend"
          subtitle="How sessions, conversations, and meetings move day by day"
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
              title="Acquisition hints, pages & geography"
              subtitle="UTM-tagged campaigns show clearly; referrers are best-effort. Then pages and geo."
              right={showPlanBadges ? <BrandPill>Advanced</BrandPill> : null}
            >
              <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-foreground">Sources (UTM &amp; referrer)</div>
                    <div className="text-[11px] text-muted-foreground">Volume → outcomes</div>
                  </div>
                  <MiniBarTable
                    columns={["Source", "Sessions"]}
                    rows={topSourcesDisplay.slice(0, 8).map((s: any) => {
                      const sess = Number(s.sessions ?? 0);
                      const mtgR = sess > 0 ? (Number(s.meetings ?? 0) / sess) * 100 : 0;
                      return {
                        label: normalizeSourceLabel(s.source ?? "direct"),
                        primaryValue: sess,
                        detail: (
                          <>
                            <span className="font-semibold text-foreground">{mtgR.toFixed(1)}%</span>
                            <span className="text-muted-foreground"> meeting rate · </span>
                            <span>
                              {Number(s.conversations ?? 0).toLocaleString()} conv · {Number(s.meetings ?? 0).toLocaleString()}{" "}
                              mtg
                            </span>
                          </>
                        ),
                      };
                    })}
                  />
                  <div className="mt-2 rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">UTM parameters</span> are the most reliable campaign
                    labels. We also keep a <span className="font-medium text-foreground">first-touch referrer</span> and
                    detect common ad click ids (<span className="font-medium text-foreground">gclid</span>,{" "}
                    <span className="font-medium text-foreground">fbclid</span>, etc.) when UTMs are missing. Raw
                    referrers are still often stripped (in-app browsers, privacy), so &quot;Direct&quot; can stay high —
                    cross-check with GA / ads when needed.
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-foreground">Top pages</div>
                    <div className="text-[11px] text-muted-foreground">Volume → outcomes</div>
                  </div>
                  <MiniBarTable
                    columns={["Page", "Sessions"]}
                    rows={topPages.slice(0, 8).map((p: any) => {
                      const sess = Number(p.sessions ?? 0);
                      const mtgR = sess > 0 ? (Number(p.meetings ?? 0) / sess) * 100 : 0;
                      return {
                        label: normalizeLabel(p.page ?? "/"),
                        primaryValue: sess,
                        detail: (
                          <>
                            <span className="font-semibold text-foreground">{mtgR.toFixed(1)}%</span>
                            <span className="text-muted-foreground"> meeting rate · </span>
                            <span>
                              {Number(p.conversations ?? 0).toLocaleString()} conv · {Number(p.meetings ?? 0).toLocaleString()}{" "}
                              mtg
                            </span>
                          </>
                        ),
                      };
                    })}
                  />
                </div>
              </div>

              <div className="mt-6 space-y-4 border-t border-border/60 pt-6">
                {useCountriesTable ? (
                  <>
                    {canShowZoneDrilldown ? (
                      <Tabs defaultValue="global" className="w-full gap-4">
                        <TabsList className="grid h-auto w-full max-w-md grid-cols-2 gap-1 rounded-xl bg-muted/80 p-1">
                          <TabsTrigger
                            value="global"
                            className="rounded-lg px-3 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                          >
                            Global
                          </TabsTrigger>
                          <TabsTrigger
                            value="territories"
                            className="rounded-lg px-3 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                          >
                            Sales territories
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="global" className="mt-0 space-y-3 outline-none">
                          <p className="text-xs text-muted-foreground">
                            Top countries by activity for this period — <span className="font-medium text-foreground">all</span>{" "}
                            visitors we can place geographically (not filtered by sales zones).
                          </p>
                          {geoInsight ? (
                            <p className="border-l-2 border-fuchsia-400/70 pl-3 text-xs leading-relaxed text-muted-foreground">
                              <span className="font-medium text-foreground">Takeaway · </span>
                              {geoInsight}
                            </p>
                          ) : null}
                          {topCountriesKnown.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No visits could be assigned to a country this period.
                            </p>
                          ) : (
                            <GeoKpiTable
                              rows={topCountriesKnown.slice(0, 8).map((t: any) => ({
                                label: normalizeLabel(t.countryLabel ?? t.countryCode),
                                sessions: Number(t.sessions ?? 0),
                                conversations: Number(t.conversations ?? 0),
                                meetings: Number(t.meetings ?? 0),
                              }))}
                            />
                          )}
                          {unknownCountryRow ? (
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">Not in table:</span>{" "}
                              {Number(unknownCountryRow.sessions ?? 0).toLocaleString()} sessions ·{" "}
                              {Number(unknownCountryRow.conversations ?? 0).toLocaleString()} conversations ·{" "}
                              {Number(unknownCountryRow.meetings ?? 0).toLocaleString()} meetings from visits with no
                              country signal (privacy, VPN, or missing geo).
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Country is shown when we receive a country code with the event.
                            </p>
                          )}
                        </TabsContent>

                        <TabsContent value="territories" className="mt-0 space-y-4 outline-none">
                          <div className="space-y-1.5 text-xs text-muted-foreground">
                            <p>
                              Same numbers as <span className="font-medium text-foreground">Global</span>, but only countries
                              that belong to each <span className="font-medium text-foreground">sales zone</span> you set
                              in Team &amp; Territories — so you can read performance per region (e.g. “Europe”) without
                              mixing in the rest of the world.
                            </p>
                            <p>
                              <span className="font-medium text-foreground">Why only one pill (e.g. Europe)?</span> Not
                              hardcoded: we list zones that have a country list, excluding “Whole world”, up to four — and
                              only if that zone has attributed traffic this period. If most activity maps to one zone, you
                              may see a single tab until other regions get traffic.
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
                                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                                    active
                                      ? "bg-gradient-to-r from-fuchsia-600 to-rose-500 border-fuchsia-200 text-white shadow-sm"
                                      : "border-slate-200 bg-white text-muted-foreground hover:border-fuchsia-200/60 hover:bg-fuchsia-50/50 hover:text-foreground",
                                  ].join(" ")}
                                >
                                  {z.territoryLabel ?? z.territoryKey}
                                </button>
                              );
                            })}
                          </div>

                          <div>
                            <div className="mb-2 text-sm font-medium">
                              Countries in{" "}
                              {zoneTerritoriesWithCountries.find(
                                (z: any) => String(z.territoryKey) === selectedZoneTerritoryKey,
                              )?.territoryLabel ?? selectedZoneTerritoryKey}
                            </div>
                            <GeoKpiTable
                              rows={countriesInSelectedZone.slice(0, 8).map((t: any) => ({
                                label: normalizeLabel(t.countryLabel ?? t.countryCode),
                                sessions: Number(t.sessions ?? 0),
                                conversations: Number(t.conversations ?? 0),
                                meetings: Number(t.meetings ?? 0),
                              }))}
                            />
                            {countriesInSelectedZone.length === 0 ? (
                              <p className="mt-2 text-xs text-muted-foreground">
                                No attributed traffic in this zone for the period, or geo is missing for those visits.
                              </p>
                            ) : null}
                          </div>
                        </TabsContent>
                      </Tabs>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-sm font-medium">Countries</div>
                        <p className="text-xs text-muted-foreground">
                          Top countries for this period (org-wide). Sales-zone breakdown appears when territory country
                          lists overlap with attributed visits.
                        </p>
                        {geoInsight ? (
                          <p className="border-l-2 border-fuchsia-400/70 pl-3 text-xs leading-relaxed text-muted-foreground">
                            <span className="font-medium text-foreground">Takeaway · </span>
                            {geoInsight}
                          </p>
                        ) : null}
                        {topCountriesKnown.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No visits could be assigned to a country this period.
                          </p>
                        ) : (
                          <GeoKpiTable
                            rows={topCountriesKnown.slice(0, 8).map((t: any) => ({
                              label: normalizeLabel(t.countryLabel ?? t.countryCode),
                              sessions: Number(t.sessions ?? 0),
                              conversations: Number(t.conversations ?? 0),
                              meetings: Number(t.meetings ?? 0),
                            }))}
                          />
                        )}
                        {unknownCountryRow ? (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Not in table:</span>{" "}
                            {Number(unknownCountryRow.sessions ?? 0).toLocaleString()} sessions ·{" "}
                            {Number(unknownCountryRow.conversations ?? 0).toLocaleString()} conversations ·{" "}
                            {Number(unknownCountryRow.meetings ?? 0).toLocaleString()} meetings from visits with no
                            country signal (privacy, VPN, or missing geo).
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Country is shown when we receive a country code with the event.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : null}

                {!useCountriesTable ? (
                  <div className="space-y-3">
                    <div className="text-sm font-medium">Territories (summary)</div>
                    <p className="text-xs text-muted-foreground">
                      Country-level detail will show once visits can be attributed to a country. Until then, here is the
                      rollup by sales territory.
                    </p>
                    <GeoKpiTable
                      nameColumnLabel="Territory"
                      rows={topTerritories.slice(0, 8).map((t: any) => ({
                        label: normalizeLabel(t.territoryLabel ?? t.territoryKey),
                        sessions: Number(t.sessions ?? 0),
                        conversations: Number(t.conversations ?? 0),
                        meetings: Number(t.meetings ?? 0),
                      }))}
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