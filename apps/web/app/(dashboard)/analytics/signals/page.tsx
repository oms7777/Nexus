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
import { MorningCallQueue } from "@/modules/analytics/signals/components/MorningCallQueue";
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
              Morning call list — Hot + Ghost IP. Unlocks with Advanced Analytics.
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

  const setPreset = (preset: "hot" | "ghost_ip") => {
    const n = new URLSearchParams(searchParams.toString());
    n.set("audience", "companies");
    n.set("preset", preset);
    const qs = n.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const list = Array.isArray(rows) ? rows : [];
  const meetingsTotal = list.reduce((s, r: any) => s + Number(r.meetings ?? 0), 0);
  const sessionsTotal = list.reduce((s, r: any) => s + Number(r.sessions ?? 0), 0);
  const hotCount = list.filter((r: any) => String(r.tier ?? "").toLowerCase() === "hot").length;
  const warmCount = list.filter((r: any) => String(r.tier ?? "").toLowerCase() === "warm").length;
  const ghostIp = list.filter(
    (r: any) => r.companySource === "ip" && Number(r.meetings ?? 0) === 0,
  ).length;
  const showAlert = meetingsTotal === 0 && sessionsTotal >= 10;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-800/80 dark:text-fuchsia-300/80">
            Signals · call list
          </p>
          <div className="text-2xl font-semibold tracking-tight">Who do I call this morning?</div>
          <p className="text-sm text-muted-foreground">
            Hot accounts first, then Ghost IP (inferred company, no meeting yet). Click a row for conversations.
          </p>
        </div>
        <AnalyticsDateRangePicker value={range} onChange={setRange} />
      </div>

      {!isEmpty ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <QueueStat label="Hot" value={hotCount} tone="hot" hint="Score ≥ 120 — call first" />
            <QueueStat label="Warm" value={warmCount} tone="warm" hint="Score ≥ 45" />
            <QueueStat label="Meetings" value={meetingsTotal} tone="neutral" hint="Booked this period" />
            <QueueStat
              label="Ghost IP"
              value={ghostIp}
              tone="ip"
              hint="From IP only · 0 meetings"
            />
          </div>
          <MorningCallQueue
            rows={list as any}
            onShowHot={() => setPreset("hot")}
            onShowGhostIp={() => setPreset("ghost_ip")}
          />
        </>
      ) : null}

      {showAlert ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <span className="font-semibold">0 meetings</span> across signals this period despite{" "}
          {sessionsTotal.toLocaleString()} sessions — start with Hot / Ghost IP or check Funnel.
        </div>
      ) : null}

      {isEmpty ? (
        <div className="overflow-hidden rounded-2xl border border-dashed border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50/50 to-white p-8 shadow-sm ring-1 ring-black/[0.04] dark:border-fuchsia-900/40 dark:from-fuchsia-950/20 dark:to-background dark:ring-white/10">
          <div className="text-lg font-semibold tracking-tight">No signals yet</div>
          <div className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Signals appear when visitors generate trackable events (sessions, chat requests, conversations,
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

function QueueStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: "hot" | "warm" | "neutral" | "ip";
}) {
  const toneCls =
    tone === "hot"
      ? "border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50/80 dark:border-rose-900/40 dark:from-rose-950/40"
      : tone === "warm"
        ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/30"
        : tone === "ip"
          ? "border-sky-200 bg-sky-50/80 dark:border-sky-900/40 dark:bg-sky-950/30"
          : "border-border/70 bg-card";
  return (
    <div className={["rounded-2xl border px-4 py-3 shadow-sm", toneCls].join(" ")}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-3xl font-semibold tabular-nums tracking-tight">{value.toLocaleString()}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}
