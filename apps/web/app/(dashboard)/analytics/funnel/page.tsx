"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";

import { useEntitlements } from "@/modules/billing/hooks/use-entitlements";

import { EngagementFunnelChart } from "@/modules/analytics/funnel/components/EngagementFunnelChart";
import { ConversionRatesChart } from "@/modules/analytics/funnel/components/ConversionRatesChart";
import { InboundHealthChart } from "@/modules/analytics/funnel/components/InboundHealthChart";

function makeRange(days: number) {
  const toTs = Date.now();
  const fromTs = toTs - days * 24 * 60 * 60 * 1000;
  return { fromTs, toTs };
}

function BrandPill({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-full border border-fuchsia-200 bg-gradient-to-r from-fuchsia-600 to-rose-500 px-3 py-1 text-xs font-semibold text-white shadow-sm">
      {children}
    </div>
  );
}

function RangePills({ value, onChange }: { value: number; onChange: (v: number) => void }) {
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
              active
                ? "bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white shadow-sm"
                : "text-muted-foreground hover:bg-fuchsia-50 hover:text-foreground",
            ].join(" ")}
          >
            {d}d
          </button>
        );
      })}
    </div>
  );
}

function CardShell({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md hover:border-fuchsia-200",
        className,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
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

function LockedFunnelCard() {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">Funnel Analytics (Advanced)</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Funnels are available on Growth / Enterprise plans.
          </div>
        </div>
        <div className="rounded-full border px-3 py-1 text-xs font-medium">Locked</div>
      </div>

      <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
        <div>• Engagement funnel (sessions → experiences → conversations → meetings)</div>
        <div>• Conversion rates (exp → conv, conv → meeting)</div>
        <div>• Inbound conversion health (requests → rep started → booking proposed → meetings)</div>
      </div>

      <div className="mt-6 rounded-xl bg-muted p-4 text-sm">
        Upgrade to <span className="font-medium">Growth</span> to unlock Funnel.
      </div>
    </div>
  );
}

export default function AnalyticsFunnelPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const ent = useEntitlements();
  const advancedEnabled = !!ent.features.canUseAdvancedAnalytics;

  const [days, setDays] = useState(30);
  const { fromTs, toTs } = useMemo(() => makeRange(days), [days]);

  const data = useQuery(
    api.public.analytics.funnels,
    orgId && advancedEnabled
      ? ({
          organizationId: orgId,
          fromTs,
          toTs,
        } as any)
      : "skip",
  );

  if (!orgId) return <div className="p-6">No organization</div>;

  if (!advancedEnabled) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <div className="text-2xl font-semibold">Funnels</div>
          <div className="text-sm text-muted-foreground">
            Engagement → conversations → meetings, plus inbound performance.
          </div>
        </div>
        <LockedFunnelCard />
      </div>
    );
  }

  if (data === undefined) return <div className="p-6">Loading…</div>;

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-2xl font-semibold">Funnels</div>
          <div className="text-sm text-muted-foreground">
            Engagement → conversations → meetings, plus inbound performance.
          </div>
        </div>
        <RangePills value={days} onChange={setDays} />
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <CardShell
          title="Engagement funnel"
          subtitle="High-level product usage"
          right={<BrandPill>Advanced</BrandPill>}
        >
          <div className="space-y-2">
            <Row label="Sessions" value={Number(engagement.sessions ?? 0).toLocaleString()} />
            <Row
              label="Experience shown"
              value={Number(engagement.experiences ?? 0).toLocaleString()}
            />
            <Row
              label="Conversations created"
              value={Number(engagement.conversations ?? 0).toLocaleString()}
            />
            <Row label="Meetings booked" value={Number(engagement.meetings ?? 0).toLocaleString()} />
          </div>

          <div className="mt-4">
            <EngagementFunnelChart data={engagement as any} />
          </div>
        </CardShell>

        <CardShell
          title="Conversion rates"
          subtitle="Exp → Conv and Conv → Meeting"
          right={<BrandPill>Advanced</BrandPill>}
        >
          <ConversionRatesChart data={conversion as any} />
        </CardShell>

        <CardShell
          title="Inbound conversion health"
          subtitle="Requests → rep started → booking proposed (30s) → meetings booked"
          right={<BrandPill>Advanced</BrandPill>}
          className="lg:col-span-2"
        >
          {!inbound ? (
            <div className="text-sm text-muted-foreground">No inbound data.</div>
          ) : (
            <>
              <div className="grid gap-2 md:grid-cols-2">
                <Row
                  label="Inbound chat requests"
                  value={Number(inbound.requests ?? 0).toLocaleString()}
                />
                <Row
                  label="Rep started conversation"
                  value={Number(inbound.rep_started ?? 0).toLocaleString()}
                />
                <Row
                  label="Booking proposed (timeout 30s)"
                  value={Number(inbound.booking_proposed ?? 0).toLocaleString()}
                />
                <Row
                  label="Meetings booked"
                  value={Number(inbound.meetings_booked ?? 0).toLocaleString()}
                />
              </div>

              <div className="mt-4">
                <InboundHealthChart data={inbound as any} />
              </div>
            </>
          )}
        </CardShell>
      </div>
    </div>
  );
}