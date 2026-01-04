"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";

import { useEntitlements } from "@/modules/billing/hooks/use-entitlements";

import { EngagementFunnelChart } from "@/modules/analytics/funnel/components/EngagementFunnelChart";
import { ConversionRatesChart } from "@/modules/analytics/funnel/components/ConversionRatesChart";
import { PounceRatesChart } from "@/modules/analytics/funnel/components/PounceRatesChart";

function makeRange(days: number) {
  const toTs = Date.now();
  const fromTs = toTs - days * 24 * 60 * 60 * 1000;
  return { fromTs, toTs };
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
        {badge ? <div className="rounded-full border px-3 py-1 text-xs font-medium">{badge}</div> : null}
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
        <div>• Inbound response performance</div>
        <div>• Pounce conversion</div>
      </div>

      <div className="mt-6 rounded-xl bg-muted p-4 text-sm">
        Upgrade to <span className="font-medium">Growth</span> to unlock Funnel.
      </div>
    </div>
  );
}

function pct(num: number, den: number) {
  if (!den) return "—";
  return `${Math.round((num / den) * 100)}%`;
}

function buildNextBestImprovement(data: any) {
  const engagement = data?.engagement ?? {};
  const inbound = data?.inbound ?? {};
  const conversion = data?.conversion ?? {};

  const sessions = Number(engagement.sessions ?? 0);
  const experiences = Number(engagement.experiences ?? 0);
  const conversations = Number(engagement.conversations ?? 0);
  const meetings = Number(engagement.meetings ?? 0);

  const inboundRequests = Number(inbound.requests ?? 0);
  const repStarted = Number(inbound.rep_started ?? 0);

  if (inboundRequests > 0 && repStarted === 0) {
    return {
      title: "Turn on inbound coverage",
      body:
        "Reps are not starting inbound conversations. Enable routing + Slack alerts, and make sure at least one rep is Online.",
    };
  }

  if (conversations > 0 && meetings === 0) {
    return {
      title: "Improve meeting conversion",
      body:
        "You’re getting conversations but no meetings. Try adding a stronger “Book a meeting” CTA earlier, and simplify the booking flow.",
    };
  }

  if (experiences > 0 && conversations / Math.max(1, experiences) < 0.2) {
    return {
      title: "Increase chat start rate",
      body:
        "Many experiences are shown but few conversations start. Improve the greet message, add 2–3 strong suggestions, and confirm widget placement/targeting.",
    };
  }

  if (sessions > 0 && experiences === 0) {
    return {
      title: "Widget visibility",
      body:
        "Sessions exist but the experience isn’t being shown. Check targeting rules and placement so visitors actually see the widget.",
    };
  }

  const convToMeeting = `${pct(
    conversion.meetings_from_conversations_num ?? 0,
    conversion.meetings_from_conversations_den ?? 0,
  )}`;
  return {
    title: "Keep iterating",
    body: `Current conv → meeting is ${convToMeeting}. Next step: test variations of the booking prompt and routing rules.`,
  };
}

export default function AnalyticsFunnelPage() {
  const { organization, membership } = useOrganization();
  const orgId = organization?.id;

  const ent = useEntitlements();
  const canUseAdvancedAnalytics = !!ent.features.canUseAdvancedAnalytics;

  const isOrgAdmin = membership?.role === "org:admin";

  const [days, setDays] = useState(30);
  const { fromTs, toTs } = useMemo(() => makeRange(days), [days]);

  const [responseTargetSeconds, setResponseTargetSeconds] = useState<number>(120);

  // ✅ HARDBLOCK UI: si pas advanced, on ne call pas la query (sinon FORBIDDEN)
  const data = useQuery(
    api.public.analytics.funnels,
    orgId && canUseAdvancedAnalytics
      ? ({
          organizationId: orgId,
          fromTs,
          toTs,
          slaSeconds: responseTargetSeconds,
        } as any)
      : "skip",
  );

  if (!orgId) return <div className="p-6">No organization</div>;

  // starter/gated view
  if (!canUseAdvancedAnalytics) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <div className="text-2xl font-semibold">Funnels</div>
          <div className="text-sm text-muted-foreground">
            Engagement → conversations → meetings, plus inbound response time & pounce.
          </div>
        </div>
        <LockedFunnelCard />
      </div>
    );
  }

  if (data === undefined) return <div className="p-6">Loading…</div>;

  const engagement =
    data?.engagement ?? { sessions: 0, experiences: 0, conversations: 0, meetings: 0 };
  const conversionForChart =
    data?.conversion ?? {
      meetings_from_conversations_num: 0,
      meetings_from_conversations_den: 0,
      conversations_from_experiences_num: 0,
      conversations_from_experiences_den: 0,
    };
  const inbound = data?.inbound ?? null;
  const pounce = data?.pounce ?? null;

  const nextBest = buildNextBestImprovement(data);

  return (
    <div className="p-6 space-y-6">
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

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium">Response-time target</div>
            <div className="text-xs text-muted-foreground">
              Used to compute “Started within target” for inbound response.
            </div>
          </div>

          {isOrgAdmin ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Target</span>
              <select
                className="h-9 rounded-lg border bg-white px-3 text-sm"
                value={responseTargetSeconds}
                onChange={(e) => setResponseTargetSeconds(Number(e.target.value))}
              >
                <option value={60}>60s</option>
                <option value={120}>120s</option>
                <option value={180}>180s</option>
                <option value={300}>300s</option>
              </select>
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Admin-only setting
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-sm font-medium">Next best improvement</div>
        <div className="mt-1 text-sm text-muted-foreground">{nextBest.body}</div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Engagement Funnel" subtitle="High-level product usage" badge="Advanced">
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

        <Card title="Conversion Funnel" subtitle="Rates from experiences & conversations" badge="Advanced">
          <div className="mt-1">
            <ConversionRatesChart data={conversionForChart as any} />
          </div>
        </Card>

        <Card title="Inbound Chat Health" subtitle="Includes response-time target metric" badge="Advanced">
          {!inbound ? (
            <div className="text-sm text-muted-foreground">No inbound data.</div>
          ) : (
            <div className="space-y-2">
              <Row label="Inbound chat requests" value={Number(inbound.requests ?? 0).toLocaleString()} />
              <Row label="Requests with rep available" value={Number(inbound.with_rep_available ?? 0).toLocaleString()} />
              <Row label="Requests where rep started" value={Number(inbound.rep_started ?? 0).toLocaleString()} />
              <Row label="Started within target" value={Number(inbound.started_before_sla ?? 0).toLocaleString()} />
            </div>
          )}
        </Card>

        <Card title="Pounce Conversion" subtitle="How effective rep pounce is" badge="Advanced">
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
