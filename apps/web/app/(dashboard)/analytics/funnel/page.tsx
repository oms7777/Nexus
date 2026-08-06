"use client";

import React from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";

import { EngagementFunnelChart } from "@/modules/analytics/funnel/components/EngagementFunnelChart";
import { ConversionRatesChart } from "@/modules/analytics/funnel/components/ConversionRatesChart";
import { FunnelDropoffStrip } from "@/modules/analytics/funnel/components/FunnelDropoffStrip";
import { InboundHealthChart } from "@/modules/analytics/funnel/components/InboundHealthChart";
import { FunnelDiagnosisPanel } from "@/modules/analytics/funnel/components/FunnelDiagnosisPanel";
import {
  AnalyticsDateRangePicker,
  useAnalyticsRangeFromUrl,
} from "@/modules/analytics/shared/analytics-date-range";
import { BrandPill, CardShell, Row } from "@/modules/analytics/shared/analytics-primitives";

function LockedFunnelCard({ reason, showPlanBadges }: { reason?: string; showPlanBadges: boolean }) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md hover:border-fuchsia-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">
            Diagnose leaks {showPlanBadges ? "(Advanced)" : ""}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Missed handoffs, SLA, and drop-offs require Advanced Analytics.
          </div>
          {reason ? (
            <div className="mt-2 text-xs text-muted-foreground">
              Reason: <span className="font-medium">{reason}</span>
            </div>
          ) : null}
        </div>
        <div className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-medium text-fuchsia-700">
          Locked
        </div>
      </div>

      <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
        <div>• Drop-off between sessions → conversations → meetings</div>
        <div>• Step conversion rates</div>
        <div>• Inbound health — requests → rep started → booking proposed → meetings</div>
      </div>

      <div className="mt-6 rounded-xl border border-fuchsia-100 bg-fuchsia-50/60 p-4 text-sm">
        Unlock with the <span className="font-medium">Advanced Analytics</span> add-on.
      </div>
    </div>
  );
}

class FunnelErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: (err: unknown) => React.ReactNode },
  { err: unknown }
> {
  state = { err: null as unknown };

  static getDerivedStateFromError(err: unknown) {
    return { err };
  }

  componentDidCatch(_err: unknown) {}

  render() {
    if (this.state.err) return this.props.fallback(this.state.err);
    return this.props.children;
  }
}

function extractReason(err: unknown) {
  const msg =
    (typeof err === "object" && err && "message" in err ? String((err as any).message) : "") || "";

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
  const { range, setRange, fromTs, toTs } = useAnalyticsRangeFromUrl();

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
      <div className="space-y-6 p-6">
        <div>
          <div className="text-2xl font-semibold">Diagnose leaks</div>
          <div className="text-sm text-muted-foreground">
            Coach view — handoffs, SLA, drop-offs (not the Overview scoreboard).
          </div>
        </div>
        <LockedFunnelCard showPlanBadges={showPlanBadges} />
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-2xl font-semibold">Diagnose leaks</div>
            <div className="text-sm text-muted-foreground">
              Missed handoffs, response SLA, and drop-offs for the selected period.
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
    conversations: 0,
    meetings: 0,
  };

  const conversion = data?.conversion ?? {
    meetings_from_conversations_num: 0,
    meetings_from_conversations_den: 0,
    conversations_from_sessions_num: 0,
    conversations_from_sessions_den: 0,
  };

  const inbound = data?.inbound ?? null;
  const diagnosis = (data as any)?.diagnosis ?? null;
  const planBadge = showPlanBadges ? <BrandPill>Advanced</BrandPill> : null;

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-800/80 dark:text-fuchsia-300/80">
            Funnel · coach
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground">Diagnose leaks</div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Who was too slow, which handoffs missed, which pages never book — Overview keeps the scoreboard.
          </p>
        </div>
        <AnalyticsDateRangePicker value={range} onChange={setRange} />
      </div>

      <FunnelDiagnosisPanel diagnosis={diagnosis} showPlanBadge={planBadge} />

      <div className="grid gap-6 lg:grid-cols-12">
        <CardShell
          title="Drop-off"
          subtitle="Where volume falls between stages"
          right={planBadge}
          className="lg:col-span-7"
        >
          <EngagementFunnelChart data={engagement as any} />
          <div className="mt-5 border-t border-border/60 pt-5">
            <FunnelDropoffStrip data={engagement as any} />
          </div>
        </CardShell>

        <CardShell
          title="Step conversion"
          subtitle="Adjacent-stage rates"
          right={planBadge}
          className="lg:col-span-5"
        >
          <ConversionRatesChart data={conversion as any} />
        </CardShell>

        <CardShell
          title="Handoff flow"
          subtitle="Chat requested → rep started → booking proposed → meeting"
          right={planBadge}
          className="lg:col-span-12"
        >
          {!inbound ? (
            <div className="text-sm text-muted-foreground">No chat-request data yet.</div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
              <div className="grid gap-2 sm:grid-cols-2 lg:col-span-5">
                <Row label="Chat requested" value={Number(inbound.requests ?? 0).toLocaleString()} />
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
        <div className="space-y-6 p-6">
          <div>
            <div className="text-2xl font-semibold">Diagnose leaks</div>
            <div className="text-sm text-muted-foreground">
              Drop-off diagnostics and inbound health.
            </div>
          </div>
          <LockedFunnelCard reason={extractReason(err)} showPlanBadges={showPlanBadges} />
          <div className="text-xs text-muted-foreground">
            If this looks wrong, check the <span className="font-medium">subscriptions</span> row for this org in
            Convex (<span className="font-medium">addons.advancedAnalytics</span>).
          </div>
        </div>
      )}
    >
      <FunnelsInner orgId={orgId} advancedEnabled={advancedEnabled} showPlanBadges={showPlanBadges} />
    </FunnelErrorBoundary>
  );
}
