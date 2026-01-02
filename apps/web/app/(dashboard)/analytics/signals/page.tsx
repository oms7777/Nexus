// apps/web/app/(dashboard)/analytics/signals/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";

import { RangePills } from "@/modules/analytics/signals/components/RangePills";
import { LockedSignalsAdvancedCard } from "@/modules/analytics/signals/components/LockedSignalsAdvancedCard";
import { SignalsTable } from "@/modules/analytics/signals/components/SignalsTable";

function makeRange(days: number) {
  const toTs = Date.now();
  const fromTs = toTs - days * 24 * 60 * 60 * 1000;
  return { fromTs, toTs };
}

export default function AnalyticsSignalsPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const [days, setDays] = useState(30);
  const { fromTs, toTs } = useMemo(() => makeRange(days), [days]);

  const entitlements = useQuery(api.public.entitlements.getEntitlements, orgId ? {} : "skip");
  const advancedEnabled = !!entitlements?.features?.canUseAdvancedAnalytics;

  const rows = useQuery(
    api.public.analytics.signals,
    orgId ? { organizationId: orgId, fromTs, toTs } : "skip",
  );

  if (!orgId) return <div className="p-6">No organization</div>;
  if (rows === undefined) return <div className="p-6">Loading…</div>;

  const isEmpty = Array.isArray(rows) && rows.length === 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-semibold">Signals</div>
          <div className="text-sm text-muted-foreground">
            Prioritize accounts most likely to convert — based on real intent signals (sessions, inbound requests,
            conversations, bookings).
          </div>
        </div>

        <div className="flex items-center gap-3">
          <RangePills value={days} onChange={setDays} />
        </div>
      </div>

      {/* Advanced note */}
      {!advancedEnabled ? <LockedSignalsAdvancedCard /> : null}

      {/* Content */}
      {isEmpty ? (
        <div className="rounded-2xl border bg-white p-8 shadow-sm">
          <div className="text-lg font-semibold">No signals yet</div>
          <div className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Signals appear when visitors generate trackable events (sessions, inbound requests, conversations, bookings).
            If your traffic is mostly anonymous, Signals will show “Visitor IDs” until an email/company is captured.
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border p-4">
              <div className="text-sm font-medium">Capture identity</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Ask email in chat / booking, or enrich via CRM.
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm font-medium">Enable pounce</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Convert high-intent visitors before they bounce.
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm font-medium">Route to reps</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Response speed strongly correlates with booked meetings.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <SignalsTable rows={rows} advanced={advancedEnabled} />
      )}
    </div>
  );
}
