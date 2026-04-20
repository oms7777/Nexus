"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";

import { EngagementFunnelChart } from "@/modules/analytics/funnel/components/EngagementFunnelChart";
import { ConversionRatesChart } from "@/modules/analytics/funnel/components/ConversionRatesChart";
import { FunnelDropoffStrip } from "@/modules/analytics/funnel/components/FunnelDropoffStrip";
import { InboundHealthChart } from "@/modules/analytics/funnel/components/InboundHealthChart";
import {
  AnalyticsDateRangePicker,
  rangeToTimestamps,
  type AnalyticsRange,
} from "@/modules/analytics/shared/analytics-date-range";
import { FunnelSummaryBanner } from "@/modules/analytics/funnel/components/FunnelSummaryBanner";
import { BrandPill, CardShell, Row } from "@/modules/analytics/shared/analytics-primitives";

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

function FunnelsInner({
  orgId,
  advancedEnabled,
  showPlanBadges,
}: {
  orgId: string;
  advancedEnabled: boolean;
  showPlanBadges: boolean;
}) {
  const [range, setRange] = useState<AnalyticsRange>({ kind: "preset", days: 30 });
  const { fromTs, toTs } = useMemo(() => rangeToTimestamps(range), [range]);

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
  const primary = data?.primaryOutcome as
    | { meetings?: number; sessions?: number; conversations?: number; meetingsDelta?: number | null }
    | undefined;

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-800/80 dark:text-fuchsia-300/80">
            Funnel analytics
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground">Pipeline &amp; motion</div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Period snapshot, then volume → step conversion → inbound handling. Step rates stay in the charts below so they
            are not duplicated in the summary.
          </p>
        </div>
        <AnalyticsDateRangePicker value={range} onChange={setRange} />
      </div>

      {primary ? (
        <FunnelSummaryBanner
          meetings={Number(primary.meetings ?? 0)}
          meetingsDelta={primary.meetingsDelta ?? null}
          sessions={Number(engagement.sessions ?? 0)}
          conversations={Number(engagement.conversations ?? 0)}
          inboundRequests={Number(inbound?.requests ?? 0)}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <CardShell
          title="Volume funnel"
          subtitle="Stage counts and where volume drops between steps"
          right={showPlanBadges ? <BrandPill>Advanced</BrandPill> : null}
          className="lg:col-span-7"
        >
          <EngagementFunnelChart data={engagement as any} />
          <div className="mt-5 border-t border-border/60 pt-5">
            <FunnelDropoffStrip data={engagement as any} />
          </div>
        </CardShell>

        <CardShell
          title="Step conversion"
          subtitle="Cohort-style rates between adjacent stages (tooltip shows the ratio)"
          right={showPlanBadges ? <BrandPill>Advanced</BrandPill> : null}
          className="lg:col-span-5"
        >
          <ConversionRatesChart data={conversion as any} />
        </CardShell>

        <CardShell
          title="Inbound handling"
          subtitle="Rep routing and booking motion on inbound chats"
          right={showPlanBadges ? <BrandPill>Advanced</BrandPill> : null}
          className="lg:col-span-12"
        >
          {!inbound ? (
            <div className="text-sm text-muted-foreground">No inbound data.</div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
              <div className="grid gap-2 sm:grid-cols-2 lg:col-span-5">
                <Row label="Inbound chat requests" value={Number(inbound.requests ?? 0).toLocaleString()} />
                <Row label="Rep started conversation" value={Number(inbound.rep_started ?? 0).toLocaleString()} />
                <Row
                  label="Booking proposed (timeout 30s)"
                  value={Number(inbound.booking_proposed ?? 0).toLocaleString()}
                />
                <Row label="Meetings booked" value={Number(inbound.meetings_booked ?? 0).toLocaleString()} />
              </div>
              <div className="lg:col-span-7">
                <InboundHealthChart data={inbound as any} />
              </div>
            </div>
          )}
        </CardShell>
      </div>
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