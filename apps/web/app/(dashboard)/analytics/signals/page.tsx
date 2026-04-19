"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";

import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";

import {
  AnalyticsDateRangePicker,
  rangeToTimestamps,
  type AnalyticsRange,
} from "@/modules/analytics/shared/analytics-date-range";
import { LockedSignalsAdvancedCard } from "@/modules/analytics/signals/components/LockedSignalsAdvancedCard";
import { SignalsTable } from "@/modules/analytics/signals/components/SignalsTable";

export default function AnalyticsSignalsPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const ent = useEntitlements();
  const advancedEnabled = !!ent.features.canUseAdvancedAnalytics;

  const [range, setRange] = useState<AnalyticsRange>({ kind: "preset", days: 30 });
  const { fromTs, toTs } = useMemo(() => rangeToTimestamps(range), [range]);

  // ✅ HARDBLOCK: si pas advanced, on ne call pas la query (sinon FORBIDDEN)
  const rows = useQuery(
    api.public.analytics.signals,
    orgId && advancedEnabled ? { organizationId: orgId, fromTs, toTs } : "skip",
  );

  if (!orgId) return <div className="p-6">No organization</div>;

  if (!advancedEnabled) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="text-2xl font-semibold tracking-tight">Signals</div>
            <div className="max-w-xl text-sm text-muted-foreground">
              Prioritize accounts by intent — unlocks with Advanced Analytics.
            </div>
          </div>
          <AnalyticsDateRangePicker value={range} onChange={setRange} />
        </div>

        <LockedSignalsAdvancedCard />
      </div>
    );
  }

  if (rows === undefined) return <div className="p-6">Loading…</div>;

  const isEmpty = Array.isArray(rows) && rows.length === 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-2xl font-semibold tracking-tight">Signals</div>
          <div className="max-w-2xl space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              A ranked work queue for outreach: who showed the strongest buying signals (sessions, inbound, chats,
              bookings) in this period — similar to intent/account lists in modern GTM tools, scoped to your product and
              widget data.
            </p>
            <p>
              Rows labeled <span className="font-medium text-foreground">Visitor …</span> are anonymous until you capture
              company or email (CRM-linked accounts and domains surface automatically when events carry that metadata).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <AnalyticsDateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      {isEmpty ? (
        <div className="overflow-hidden rounded-2xl border border-dashed border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50/50 to-white p-8 shadow-sm ring-1 ring-black/[0.04] dark:border-fuchsia-900/40 dark:from-fuchsia-950/20 dark:to-background dark:ring-white/10">
          <div className="text-lg font-semibold tracking-tight">No signals yet</div>
          <div className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Signals appear when visitors generate trackable events (sessions, inbound requests, conversations, bookings).
            If your traffic is mostly anonymous, you will see visitor-style keys until an email or company is captured.
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border/80 bg-white/90 p-4 shadow-sm dark:bg-card">
              <div className="text-sm font-medium">Capture identity</div>
              <div className="mt-1 text-xs text-muted-foreground">Email in chat, booking, or CRM enrichment.</div>
            </div>
            <div className="rounded-xl border border-border/80 bg-white/90 p-4 shadow-sm dark:bg-card">
              <div className="text-sm font-medium">Respond fast</div>
              <div className="mt-1 text-xs text-muted-foreground">Intent decays quickly on inbound touches.</div>
            </div>
            <div className="rounded-xl border border-border/80 bg-white/90 p-4 shadow-sm dark:bg-card">
              <div className="text-sm font-medium">Route reps</div>
              <div className="mt-1 text-xs text-muted-foreground">Territories lift routing quality in Signals.</div>
            </div>
          </div>
        </div>
      ) : (
        <SignalsTable rows={rows} advanced={advancedEnabled} />
      )}
    </div>
  );
}
