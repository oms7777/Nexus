"use client";

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

import { BrandPill, CardShell } from "@/modules/analytics/shared/analytics-primitives";
import {
  AnalyticsDateRangePicker,
  useAnalyticsRangeFromUrl,
} from "@/modules/analytics/shared/analytics-date-range";
import { PrimaryOutcomeStrip } from "@/modules/analytics/shared/PrimaryOutcomeStrip";
import { BookingPathsPanel } from "@/modules/analytics/overview/components/BookingPathsPanel";
import { CoverageBoard } from "@/modules/analytics/overview/components/CoverageBoard";
import {
  CrmPipelineCard,
  CrmPipelineGrowthTeaser,
} from "@/modules/analytics/overview/components/CrmPipelineCard";

function niceDayLabel(day: string) {
  const parts = day.split("-");
  if (parts.length !== 3) return day;
  return `${parts[1]}/${parts[2]}`;
}

export default function AnalyticsOverviewPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const searchParams = useSearchParams();
  const showPlanBadges = searchParams.get("showPlanBadges") === "1";

  const { plan, features, canUseCrmRevenue } = useEntitlements();
  const advancedEnabled = features.canUseAdvancedAnalytics;
  const isGrowthPlus = plan === "growth" || plan === "enterprise";

  const { range, setRange, fromTs, toTs } = useAnalyticsRangeFromUrl();

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

  const meetingsN = Number(kpi.meetings ?? 0);
  const sessionsN = Number(kpi.sessions ?? 0);
  const conversationsN = Number(kpi.conversations ?? 0);

  const insight = (overview as any)?.booking_insight as string | null | undefined;
  const bookingPaths = Array.isArray((overview as any)?.booking_paths)
    ? ((overview as any).booking_paths as any[])
    : [];

  const trendRows = (Array.isArray(trends) ? trends : []).map((r: any) => ({
    day: niceDayLabel(String(r.day)),
    sessions: Number(r.sessions ?? 0),
    conversations: Number(r.conversations ?? 0),
    meetings: Number(r.meetings ?? 0),
  }));

  const repRows = Array.isArray(reps?.reps) ? reps.reps : [];
  const showTrafficAlert = meetingsN === 0 && sessionsN >= 10;

  if (!orgId) return <div className="p-6">No organization</div>;
  if (overview === undefined || trends === undefined || (advancedEnabled && reps === undefined))
    return <div className="p-6">Loading…</div>;

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-800/80 dark:text-fuchsia-300/80">
            Overview · scoreboard
          </p>
          <div className="text-2xl font-semibold tracking-tight">Command center</div>
          <p className="text-sm text-muted-foreground">
            Meetings, live coverage, pages that book, who closed — Funnel diagnoses leaks, Signals is the call list
          </p>
        </div>
        <AnalyticsDateRangePicker value={range} onChange={setRange} />
      </div>

      {showTrafficAlert ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <span className="font-semibold">0 meetings</span> with {sessionsN.toLocaleString()} sessions —
          check Funnel for leaks or Signals for accounts to call.
        </div>
      ) : null}

      <PrimaryOutcomeStrip
        meetings={meetingsN}
        sessions={sessionsN}
        conversations={conversationsN}
        meetingsDelta={deltas.meetings ?? null}
        insight={insight}
      />

      {canUseCrmRevenue ? (
        <CrmPipelineCard
          fromTs={fromTs}
          toTs={toTs}
          showPlanBadge={showPlanBadges}
        />
      ) : isGrowthPlus ? (
        <CrmPipelineGrowthTeaser showPlanBadge={showPlanBadges} />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <CoverageBoard />
        </div>
        <div className="xl:col-span-7">
          <CardShell
            title="Activity over time"
            subtitle="Sessions, conversations, and meetings day by day"
            right={showPlanBadges ? <BrandPill>Core</BrandPill> : null}
          >
            {trendRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No trend data yet.</div>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendRows} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tickMargin={8} />
                    <YAxis width={42} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="sessions" dot={false} stroke="#a855f7" strokeWidth={2} />
                    <Line
                      type="monotone"
                      dataKey="conversations"
                      dot={false}
                      stroke="#ec4899"
                      strokeWidth={2}
                    />
                    <Line type="monotone" dataKey="meetings" dot={false} stroke="#f43f5e" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardShell>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <BookingPathsPanel
            paths={bookingPaths}
            showPlanBadge={showPlanBadges ? <BrandPill>Core</BrandPill> : null}
          />
        </div>

        {advancedEnabled ? (
          <CardShell
            title="Who converted"
            subtitle="Reps that booked meetings this period"
            right={showPlanBadges ? <BrandPill>Advanced</BrandPill> : null}
          >
            {repRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No rep attribution yet for this period.</div>
            ) : (
              <div className="space-y-2">
                {repRows.slice(0, 8).map((r: any) => (
                  <div
                    key={r.repUserId}
                    className="flex items-center justify-between rounded-xl border border-border/70 bg-gradient-to-r from-white to-fuchsia-50/40 p-3 dark:from-card dark:to-fuchsia-950/20"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.name ?? "Rep"}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.title ?? "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-semibold tabular-nums">
                        {Number(r.meetings ?? 0).toLocaleString()}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        meetings
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardShell>
        ) : (
          <CardShell title="Tip" subtitle="Advanced Analytics">
            <p className="text-sm text-muted-foreground">
              Unlock the reps leaderboard and Signals call queue with Advanced Analytics.
            </p>
          </CardShell>
        )}
      </div>
    </div>
  );
}
