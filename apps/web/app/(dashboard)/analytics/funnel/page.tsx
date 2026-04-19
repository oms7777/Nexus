"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";

import { EngagementFunnelChart } from "@/modules/analytics/funnel/components/EngagementFunnelChart";
import { ConversionRatesChart } from "@/modules/analytics/funnel/components/ConversionRatesChart";
import { FunnelDropoffStrip } from "@/modules/analytics/funnel/components/FunnelDropoffStrip";
import { InboundHealthChart } from "@/modules/analytics/funnel/components/InboundHealthChart";
import { PounceFunnelChart } from "@/modules/analytics/funnel/components/PounceFunnelChart";
import { FunnelInsightsPanel } from "@/modules/analytics/funnel/components/FunnelInsightsPanel";
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import {
  AnalyticsDateRangePicker,
  rangeToTimestamps,
  type AnalyticsRange,
} from "@/modules/analytics/shared/analytics-date-range";
import { BrandPill, CardShell, Row } from "@/modules/analytics/shared/analytics-primitives";
import { PrimaryOutcomeStrip } from "@/modules/analytics/shared/PrimaryOutcomeStrip";

function LockedFunnelCard({ reason, showPlanBadges }: { reason?: string; showPlanBadges: boolean }) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md hover:border-fuchsia-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">
            Funnel Analytics {showPlanBadges ? "(Advanced)" : ""}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Funnels are available on Growth / Enterprise plans.
          </div>
          {reason ? (
            <div className="mt-2 text-xs text-muted-foreground">
              Reason: <span className="font-medium">{reason}</span>
            </div>
          ) : null}
        </div>
        <div className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-medium text-fuchsia-700">Locked</div>
      </div>

      <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
        <div>• Engagement — sessions → experiences → conversations → meetings</div>
        <div>• Conversion — strict rates (experience → conversation → meeting)</div>
        <div>• Inbound health — requests → rep started → booking proposed → meetings</div>
        <div>• Proactive — pounce attempts → conversations → meetings</div>
      </div>

      <div className="mt-6 rounded-xl bg-fuchsia-50/60 p-4 text-sm border border-fuchsia-100">
        Upgrade to <span className="font-medium">Growth</span> to unlock Funnel.
      </div>
    </div>
  );
}

/**
 * ✅ ErrorBoundary pour catcher les erreurs Convex (FORBIDDEN, etc.)
 * et éviter l’écran cassé + console spam.
 */
class FunnelErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: (err: unknown) => React.ReactNode },
  { err: unknown }
> {
  state = { err: null as unknown };

  static getDerivedStateFromError(err: unknown) {
    return { err };
  }

  componentDidCatch(err: unknown) {
    // optionnel : tu peux logger ici si tu veux
    // console.error(err);
  }

  render() {
    if (this.state.err) return this.props.fallback(this.state.err);
    return this.props.children;
  }
}

function extractReason(err: unknown) {
  // ConvexError peut arriver sous plusieurs formes côté client bundlé,
  // donc on reste robuste.
  const msg =
    (typeof err === "object" && err && "message" in err ? String((err as any).message) : "") || "";

  // Si ton ConvexError est construit avec {code, message}, parfois il apparaît dans message stringify
  // ex: "ConvexError: { code: 'FORBIDDEN', message: 'Advanced Analytics required' }"
  if (msg.toLowerCase().includes("advanced analytics required")) return "Advanced Analytics required";
  if (msg.toLowerCase().includes("forbidden")) return "Forbidden";
  if (msg) return msg.slice(0, 140);
  return "Server error";
}

const FUNNEL_VIEWS = ["engagement", "conversion", "inbound", "proactive"] as const;
type FunnelView = (typeof FUNNEL_VIEWS)[number];

function normalizeFunnelView(raw: string | null): FunnelView {
  if (raw === "conversion" || raw === "inbound" || raw === "proactive" || raw === "engagement") return raw;
  return "engagement";
}

function FunnelsInner({
  orgId,
  advancedEnabled,
  showPlanBadges,
}: {
  orgId: string;
  advancedEnabled: boolean;
  showPlanBadges: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [range, setRange] = useState<AnalyticsRange>({ kind: "preset", days: 30 });
  const { fromTs, toTs } = useMemo(() => rangeToTimestamps(range), [range]);

  const view = normalizeFunnelView(searchParams.get("view"));

  useEffect(() => {
    if (!advancedEnabled) return;
    const raw = searchParams.get("view");
    if (raw && !FUNNEL_VIEWS.includes(raw as FunnelView)) {
      const n = new URLSearchParams(searchParams.toString());
      n.delete("view");
      const qs = n.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [advancedEnabled, pathname, router, searchParams]);

  const setView = (next: FunnelView) => {
    const n = new URLSearchParams(searchParams.toString());
    if (next === "engagement") n.delete("view");
    else n.set("view", next);
    const qs = n.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const data = useQuery(
    api.public.analytics.funnels,
    advancedEnabled
      ? {
          organizationId: orgId,
          fromTs,
          toTs,
        }
      : "skip",
  );

  if (!advancedEnabled) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <div className="text-2xl font-semibold">Funnels</div>
          <div className="text-sm text-muted-foreground">
            Engagement → conversations → meetings, plus inbound performance.
          </div>
        </div>
        <LockedFunnelCard showPlanBadges={showPlanBadges} />
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-2xl font-semibold">Funnels</div>
            <div className="text-sm text-muted-foreground">
              Engagement → conversations → meetings, plus inbound performance.
            </div>
          </div>
          <AnalyticsDateRangePicker value={range} onChange={setRange} />
        </div>
        <div className="rounded-2xl border bg-white p-6 shadow-sm">Loading…</div>
      </div>
    );
  }

  const engagement = data?.engagement ?? {
    sessions: 0,
    experiences: 0,
    conversations: 0,
    meetings: 0,
  };

  const conversion = data?.conversion ?? {
    meetings_from_conversations_num: 0,
    meetings_from_conversations_den: 0,
    conversations_from_experiences_num: 0,
    conversations_from_experiences_den: 0,
  };

  const inbound = data?.inbound ?? null;
  const pounce = data?.pounce ?? { attempts: 0, conversations: 0, meetings: 0 };
  const primary = data?.primaryOutcome as
    | { meetings?: number; sessions?: number; conversations?: number; meetingsDelta?: number | null }
    | undefined;

  const cNum = Number(conversion.conversations_from_experiences_num ?? 0);
  const cDen = Number(conversion.conversations_from_experiences_den ?? 0);
  const mNum = Number(conversion.meetings_from_conversations_num ?? 0);
  const mDen = Number(conversion.meetings_from_conversations_den ?? 0);
  const expToConvPct = cDen > 0 ? Math.round((cNum / cDen) * 100) : null;
  const convToMeetPct = mDen > 0 ? Math.round((mNum / mDen) * 100) : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="text-2xl font-semibold tracking-tight">Funnels</div>
          <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Four views</span> — engagement, strict conversion, inbound
            ops, and proactive pounce — same period as Overview. Use{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">?view=</code> to deep-link.
          </div>
        </div>
        <AnalyticsDateRangePicker value={range} onChange={setRange} />
      </div>

      <div className="rounded-2xl border border-border/80 bg-muted/20 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Overview</span> stays broad (acquisition + geo).{" "}
        <span className="font-medium text-foreground">Funnels</span> drills into drop-offs per story; the outcome strip
        below is shared once for the period.
      </div>

      {primary ? (
        <PrimaryOutcomeStrip
          meetings={Number(primary.meetings ?? 0)}
          sessions={Number(primary.sessions ?? 0)}
          conversations={Number(primary.conversations ?? 0)}
          meetingsDelta={primary.meetingsDelta ?? null}
        />
      ) : null}

      <FunnelInsightsPanel engagement={engagement as any} inbound={inbound as any} />

      <Tabs value={view} onValueChange={(v) => setView(v as FunnelView)}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted/80 p-1 lg:inline-grid lg:max-w-none lg:grid-cols-4">
          <TabsTrigger value="engagement" className="rounded-lg text-xs sm:text-sm">
            Engagement
          </TabsTrigger>
          <TabsTrigger value="conversion" className="rounded-lg text-xs sm:text-sm">
            Conversion
          </TabsTrigger>
          <TabsTrigger value="inbound" className="rounded-lg text-xs sm:text-sm">
            Inbound
          </TabsTrigger>
          <TabsTrigger value="proactive" className="rounded-lg text-xs sm:text-sm">
            Proactive
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "engagement" ? (
        <CardShell
          title="Engagement funnel"
          subtitle="Sessions → experiences → conversations → meetings (volumes + retention)"
          right={showPlanBadges ? <BrandPill>Advanced</BrandPill> : null}
        >
          <div className="grid gap-2 md:grid-cols-2">
            <Row label="Sessions" value={Number(engagement.sessions ?? 0).toLocaleString()} />
            <Row
              label="Experience shown"
              value={
                <span className="inline-flex items-center gap-2">
                  <span>{Number(engagement.experiences ?? 0).toLocaleString()}</span>
                  <span className="rounded-full border bg-muted/60 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {Number(engagement.sessions ?? 0) > 0
                      ? `${Math.round((Number(engagement.experiences ?? 0) / Number(engagement.sessions ?? 0)) * 100)}%`
                      : "—"}
                  </span>
                </span>
              }
            />
            <Row
              label="Conversations created"
              value={
                <span className="inline-flex items-center gap-2">
                  <span>{Number(engagement.conversations ?? 0).toLocaleString()}</span>
                  <span className="rounded-full border bg-muted/60 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {Number(engagement.experiences ?? 0) > 0
                      ? `${Math.round((Number(engagement.conversations ?? 0) / Number(engagement.experiences ?? 0)) * 100)}%`
                      : "—"}
                  </span>
                </span>
              }
            />
            <Row
              label="Meetings booked"
              value={
                <span className="inline-flex items-center gap-2">
                  <span>{Number(engagement.meetings ?? 0).toLocaleString()}</span>
                  <span className="rounded-full border bg-muted/60 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {Number(engagement.conversations ?? 0) > 0
                      ? `${Math.round((Number(engagement.meetings ?? 0) / Number(engagement.conversations ?? 0)) * 100)}%`
                      : "—"}
                  </span>
                </span>
              }
            />
          </div>

          <FunnelDropoffStrip data={engagement as any} />

          <div className="mt-4">
            <EngagementFunnelChart data={engagement as any} />
          </div>
        </CardShell>
      ) : null}

      {view === "conversion" ? (
        <CardShell
          title="Conversion rates"
          subtitle="Strict cohort-style rates from funnel events (not duplicated in Engagement counts)"
          right={showPlanBadges ? <BrandPill>Advanced</BrandPill> : null}
        >
          <div className="grid gap-2 md:grid-cols-2">
            <Row
              label="Experience → conversation"
              value={
                expToConvPct !== null ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{expToConvPct}%</span>
                    <span className="text-xs text-muted-foreground">
                      ({cNum.toLocaleString()} / {cDen.toLocaleString()})
                    </span>
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <Row
              label="Conversation → meeting"
              value={
                convToMeetPct !== null ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{convToMeetPct}%</span>
                    <span className="text-xs text-muted-foreground">
                      ({mNum.toLocaleString()} / {mDen.toLocaleString()})
                    </span>
                  </span>
                ) : (
                  "—"
                )
              }
            />
          </div>
          <div className="mt-4">
            <ConversionRatesChart data={conversion as any} />
          </div>
        </CardShell>
      ) : null}

      {view === "inbound" ? (
        <CardShell
          title="Inbound conversion health"
          subtitle="Intent → routing → booking — operational pipeline"
          right={showPlanBadges ? <BrandPill>Advanced</BrandPill> : null}
        >
          {!inbound ? (
            <div className="text-sm text-muted-foreground">No inbound data.</div>
          ) : (
            <>
              <div className="grid gap-2 md:grid-cols-2">
                <Row label="Inbound chat requests" value={Number(inbound.requests ?? 0).toLocaleString()} />
                <Row label="Rep started conversation" value={Number(inbound.rep_started ?? 0).toLocaleString()} />
                <Row
                  label="Booking proposed (timeout 30s)"
                  value={Number(inbound.booking_proposed ?? 0).toLocaleString()}
                />
                <Row label="Meetings booked" value={Number(inbound.meetings_booked ?? 0).toLocaleString()} />
              </div>

              <div className="mt-4">
                <InboundHealthChart data={inbound as any} />
              </div>

              <div className="mt-4 rounded-xl border border-dashed border-fuchsia-200/70 bg-fuchsia-50/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground dark:border-fuchsia-900/40 dark:bg-fuchsia-950/25">
                <span className="font-medium text-foreground">Rep started</span> stays at zero until reps emit{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">inbound_rep_started</code> from the
                inbox workflow. Requests and meetings can still move without it depending on automation.
              </div>
            </>
          )}
        </CardShell>
      ) : null}

      {view === "proactive" ? (
        <CardShell
          title="Proactive (pounce)"
          subtitle="Outbound automation → conversation → meeting"
          right={showPlanBadges ? <BrandPill>Advanced</BrandPill> : null}
        >
          <div className="grid gap-2 md:grid-cols-3">
            <Row label="Pounce attempts" value={Number(pounce.attempts ?? 0).toLocaleString()} />
            <Row label="Pounce conversations" value={Number(pounce.conversations ?? 0).toLocaleString()} />
            <Row label="Pounce meetings" value={Number(pounce.meetings ?? 0).toLocaleString()} />
          </div>
          <div className="mt-4">
            <PounceFunnelChart data={pounce as any} />
          </div>
          <div className="mt-4 rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            Counts come from analytics event types{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">pounce_attempt</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">pounce_conversation</code>, and{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">pounce_meeting</code>. They are separate
            from the engagement funnel totals above.
          </div>
        </CardShell>
      ) : null}
    </div>
  );
}

export default function AnalyticsFunnelPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const ent = useEntitlements();
  const advancedEnabled = !!ent.features.canUseAdvancedAnalytics;

  const searchParams = useSearchParams();
  const showPlanBadges = searchParams.get("showPlanBadges") === "1";

  if (!orgId) return <div className="p-6">No organization</div>;

  return (
    <FunnelErrorBoundary
      fallback={(err) => (
        <div className="p-6 space-y-6">
          <div>
            <div className="text-2xl font-semibold">Funnels</div>
            <div className="text-sm text-muted-foreground">
              Engagement → conversations → meetings, plus inbound performance.
            </div>
          </div>

          {/* ✅ si backend dit FORBIDDEN / Advanced Analytics required */}
          <LockedFunnelCard reason={extractReason(err)} showPlanBadges={showPlanBadges} />

          <div className="text-xs text-muted-foreground">
            If this looks wrong, check the <span className="font-medium">subscriptions</span> row for this org in
            Convex (plan / status / addons).
          </div>
        </div>
      )}
    >
      <FunnelsInner orgId={orgId} advancedEnabled={advancedEnabled} showPlanBadges={showPlanBadges} />
    </FunnelErrorBoundary>
  );
}