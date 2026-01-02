// apps/web/app/(dashboard)/analytics/funnel/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";

import { EngagementFunnelChart } from "@/modules/analytics/funnel/components/EngagementFunnelChart";
import { ConversionRatesChart } from "@/modules/analytics/funnel/components/ConversionRatesChart";
import { PounceRatesChart } from "@/modules/analytics/funnel/components/PounceRatesChart";

function makeRange(days: number) {
  const toTs = Date.now();
  const fromTs = toTs - days * 24 * 60 * 60 * 1000;
  return { fromTs, toTs };
}

function RangePills({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const opts = [7, 30, 90];
  return (
    <div className="inline-flex rounded-xl border bg-white p-1 shadow-sm">
      {opts.map((d) => {
        const active = d === value;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={[
              "px-3 py-1.5 text-sm rounded-lg transition",
              active ? "bg-black text-white" : "text-muted-foreground hover:bg-accent",
            ].join(" ")}
          >
            {d}d
          </button>
        );
      })}
    </div>
  );
}

function Card({
  title,
  subtitle,
  badge,
  children,
}: React.PropsWithChildren<{
  title: string;
  subtitle?: string;
  badge?: string;
}>) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-muted-foreground">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
        {badge ? (
          <div className="rounded-full border px-3 py-1 text-xs font-medium">{badge}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{String(value ?? "—")}</span>
    </div>
  );
}

function LockedAdvancedCard() {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">Advanced Funnel Analytics</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Unlock SLA tracking and deeper inbound breakdowns.
          </div>
        </div>
        <div className="rounded-full border px-3 py-1 text-xs font-medium">Locked</div>
      </div>

      <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
        <div>• SLA-based inbound metrics</div>
        <div>• Future: segmentation (territory / utm / reps)</div>
      </div>

      <div className="mt-6 rounded-xl bg-muted p-4 text-sm">
        Enable <span className="font-medium">Advanced Analytics</span> to view SLA & advanced
        inbound metrics.
      </div>
    </div>
  );
}

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}

export default function AnalyticsFunnelPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const [days, setDays] = useState(30);
  const { fromTs, toTs } = useMemo(() => makeRange(days), [days]);

  // entitlements
  const entitlements = useQuery(api.public.entitlements.getEntitlements, orgId ? {} : "skip");
  const advancedEnabled = !!entitlements?.features?.canUseAdvancedAnalytics;

  // SLA only if advanced
  const [slaSeconds, setSlaSeconds] = useState<number>(120);

  const data = useQuery(
    api.public.analytics.funnels,
    orgId
      ? ({
          organizationId: orgId,
          fromTs,
          toTs,
          ...(advancedEnabled ? { slaSeconds } : {}),
        } as any)
      : "skip",
  );

  if (!orgId) return <div className="p-6">No organization</div>;
  if (data === undefined) return <div className="p-6">Loading…</div>;

  // ✅ New backend shape
  // { engagement, conversion, inbound, pounce }
  const engagement = data?.engagement ?? {
    sessions: 0,
    experiences: 0,
    conversations: 0,
    meetings: 0,
  };

  const conversionForChart = data?.conversion ?? {
    meetings_from_conversations_num: 0,
    meetings_from_conversations_den: 0,
    conversations_from_experiences_num: 0,
    conversations_from_experiences_den: 0,
  };

  const inbound = data?.inbound ?? null;
  const pounce = data?.pounce ?? null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-semibold">Funnels</div>
          <div className="text-sm text-muted-foreground">
            Engagement → conversations → meetings, plus inbound response time & pounce.
          </div>
        </div>

        <div className="flex items-center gap-3">
          <RangePills value={days} onChange={setDays} />
        </div>
      </div>

      {/* Advanced controls */}
      {!advancedEnabled ? (
        <LockedAdvancedCard />
      ) : (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">Advanced controls</div>
              <div className="text-xs text-muted-foreground">
                SLA is used to compute “started before SLA” for inbound response.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">SLA</span>
              <select
                className="h-9 rounded-lg border bg-white px-3 text-sm"
                value={slaSeconds}
                onChange={(e) => setSlaSeconds(Number(e.target.value))}
              >
                <option value={60}>60s</option>
                <option value={120}>120s</option>
                <option value={180}>180s</option>
                <option value={300}>300s</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Engagement */}
        <Card title="Engagement Funnel" subtitle="High-level product usage" badge="Core">
          <div className="space-y-2">
            <Row label="Sessions" value={Number(engagement.sessions ?? 0).toLocaleString()} />
            <Row label="Experience shown" value={Number(engagement.experiences ?? 0).toLocaleString()} />
            <Row label="Conversations created" value={Number(engagement.conversations ?? 0).toLocaleString()} />
            <Row label="Meetings booked" value={Number(engagement.meetings ?? 0).toLocaleString()} />
          </div>

          <div className="mt-4">
            <EngagementFunnelChart data={engagement as any} />
          </div>
        </Card>

        {/* Conversion */}
        <Card title="Conversion Funnel" subtitle="Rates from experiences & conversations" badge="Core">
          <div className="mt-1">
            <ConversionRatesChart data={conversionForChart as any} />
          </div>
        </Card>

        {/* Inbound */}
        <Card
          title="Inbound Chat Health"
          subtitle={advancedEnabled ? "Includes SLA-based metric" : "SLA metric requires Advanced"}
          badge={advancedEnabled ? "Advanced" : "Core"}
        >
          {!inbound ? (
            <div className="text-sm text-muted-foreground">No inbound data.</div>
          ) : (
            <div className="space-y-2">
              <Row label="Inbound chat requests" value={Number(inbound.requests ?? 0).toLocaleString()} />
              <Row label="Requests with rep available" value={Number(inbound.with_rep_available ?? 0).toLocaleString()} />
              <Row label="Requests where rep started" value={Number(inbound.rep_started ?? 0).toLocaleString()} />

              {advancedEnabled ? (
                <Row label="Started &lt; SLA" value={Number(inbound.started_before_sla ?? 0).toLocaleString()} />
              ) : (
                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  “Started &lt; SLA” is available in Advanced Analytics.
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Pounce */}
        <Card title="Pounce Conversion" subtitle="How effective rep pounce is" badge="Core">
          <div className="space-y-2">
            <Row label="Pounce attempts" value={Number(pounce?.attempts ?? 0).toLocaleString()} />
            <Row label="Pounce conversations" value={Number(pounce?.conversations ?? 0).toLocaleString()} />
            <Row label="Pounce meetings" value={Number(pounce?.meetings ?? 0).toLocaleString()} />
          </div>

          <div className="mt-4">
            <PounceRatesChart data={pounce ?? undefined} />
          </div>
        </Card>
      </div>
    </div>
  );
}
