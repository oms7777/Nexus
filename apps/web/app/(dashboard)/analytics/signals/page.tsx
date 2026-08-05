"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";

import {
  AnalyticsDateRangePicker,
  useAnalyticsRangeFromUrl,
} from "@/modules/analytics/shared/analytics-date-range";
import { LockedSignalsAdvancedCard } from "@/modules/analytics/signals/components/LockedSignalsAdvancedCard";
import {
  SignalsTable,
  type SignalsAudience,
} from "@/modules/analytics/signals/components/SignalsTable";
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";

function normalizeAudience(raw: string | null): SignalsAudience {
  if (raw === "domains") return "domains";
  return "companies";
}

export default function AnalyticsSignalsPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const ent = useEntitlements();
  const advancedEnabled = !!ent.features.canUseAdvancedAnalytics;

  const { range, setRange, fromTs, toTs } = useAnalyticsRangeFromUrl();

  const rows = useQuery(
    api.public.analytics.signals,
    orgId && advancedEnabled ? { organizationId: orgId, fromTs, toTs } : "skip",
  );

  useEffect(() => {
    if (!advancedEnabled) return;
    const n = new URLSearchParams(searchParams.toString());
    let changed = false;
    if (!n.get("audience")) {
      n.set("audience", "companies");
      changed = true;
    }
    if (n.get("preset") === "named") {
      n.delete("preset");
      changed = true;
    }
    if (n.get("audience") === "anonymous") {
      n.set("audience", "companies");
      changed = true;
    }
    if (!changed) return;
    const qs = n.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [advancedEnabled, pathname, router, searchParams]);

  if (!orgId) return <div className="p-6">No organization</div>;

  if (!advancedEnabled) {
    return (
      <div className="space-y-6 p-6">
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
  const audience = normalizeAudience(searchParams.get("audience"));

  const setAudience = (next: SignalsAudience) => {
    const n = new URLSearchParams(searchParams.toString());
    n.set("audience", next);
    const qs = n.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const meetingsTotal = Array.isArray(rows)
    ? rows.reduce((s, r: any) => s + Number(r.meetings ?? 0), 0)
    : 0;
  const sessionsTotal = Array.isArray(rows)
    ? rows.reduce((s, r: any) => s + Number(r.sessions ?? 0), 0)
    : 0;
  const showAlert = meetingsTotal === 0 && sessionsTotal >= 10;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-2xl font-semibold tracking-tight">Signals</div>
          <p className="text-sm text-muted-foreground">
            Hot accounts first — click a row to open related conversations
          </p>
        </div>
        <AnalyticsDateRangePicker value={range} onChange={setRange} />
      </div>

      {showAlert ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <span className="font-semibold">0 meetings</span> across signals this period despite{" "}
          {sessionsTotal.toLocaleString()} sessions — prioritize Warm/Hot outreach or check Funnel drop-off.
        </div>
      ) : null}

      {isEmpty ? (
        <div className="overflow-hidden rounded-2xl border border-dashed border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50/50 to-white p-8 shadow-sm ring-1 ring-black/[0.04] dark:border-fuchsia-900/40 dark:from-fuchsia-950/20 dark:to-background dark:ring-white/10">
          <div className="text-lg font-semibold tracking-tight">No signals yet</div>
          <div className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Signals appear when visitors generate trackable events (sessions, inbound requests, conversations,
            bookings).
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Tabs value={audience} onValueChange={(v) => setAudience(v as SignalsAudience)}>
            <TabsList className="inline-grid h-auto w-full max-w-md grid-cols-2 gap-1 rounded-xl bg-muted/80 p-1 sm:w-auto">
              <TabsTrigger value="companies" className="rounded-lg text-xs sm:text-sm">
                Companies
              </TabsTrigger>
              <TabsTrigger value="domains" className="rounded-lg text-xs sm:text-sm">
                Email domains
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <SignalsTable rows={rows} advanced={advancedEnabled} audience={audience} />
        </div>
      )}
    </div>
  );
}
