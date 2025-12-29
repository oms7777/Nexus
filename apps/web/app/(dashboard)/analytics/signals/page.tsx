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

  const entitlements = useQuery(
    api.public.entitlements.getEntitlements,
    orgId ? {} : "skip"
  );

  const advancedEnabled = !!entitlements?.features?.canUseAdvancedAnalytics;

  const rows = useQuery(
    api.public.analytics.signals,
    orgId ? { organizationId: orgId, fromTs, toTs } : "skip"
  );

  if (!orgId) return <div className="p-6">No organization</div>;
  if (rows === undefined) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-semibold">Signals</div>
          <div className="text-sm text-muted-foreground">
            Which accounts are “hot” based on sessions, time on site, and engagement.
          </div>
        </div>

        <div className="flex items-center gap-3">
          <RangePills value={days} onChange={setDays} />
        </div>
      </div>

      {/* Advanced note */}
      {!advancedEnabled ? <LockedSignalsAdvancedCard /> : null}

      {/* Table */}
      <SignalsTable rows={rows} advanced={advancedEnabled} />
    </div>
  );
}
