"use client";

import { useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";

function useStableRange(days = 30) {
  const toRef = useRef<number>(Date.now());
  const toTs = toRef.current;
  const fromTs = toTs - days * 24 * 60 * 60 * 1000;
  return { fromTs, toTs };
}

function Card({
  title,
  children,
}: React.PropsWithChildren<{ title: string }>) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-3 text-sm font-medium text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{(value ?? 0).toLocaleString()}</span>
    </div>
  );
}

function RateRow({
  label,
  num,
  den,
}: {
  label: string;
  num: number;
  den: number;
}) {
  const pct = den > 0 ? Math.round((num / den) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2 w-full rounded bg-muted">
        <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] text-muted-foreground">
        {(num ?? 0).toLocaleString()} / {(den ?? 0).toLocaleString()}
      </div>
    </div>
  );
}

export default function AnalyticsFunnelPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { fromTs, toTs } = useStableRange(30);

  const data = useQuery(
    api.public.analytics.funnels,
    orgId ? { organizationId: orgId, fromTs, toTs } : "skip"
  );

  if (!orgId) return <div className="p-6">No organization</div>;
  if (!data) return <div className="p-6">Loading…</div>;

  const { engagement, conversion, inbound, pounce } = data;

  return (
    <div className="grid gap-6 p-6 md:grid-cols-2">
      {/* Engagement */}
      <Card title="Engagement Funnel">
        <div className="space-y-2">
          <Row label="Total sessions" value={engagement?.sessions ?? 0} />
          <Row label="Sessions with experience" value={engagement?.experiences ?? 0} />
          <Row label="Sessions with conversation" value={engagement?.conversations ?? 0} />
          <Row label="Meetings booked" value={engagement?.meetings ?? 0} />
        </div>
      </Card>

      {/* Conversion */}
      <Card title="Conversion Funnel">
        <div className="space-y-4">
          <RateRow
            label="Conversations → Meetings"
            num={conversion?.meetings_from_conversations_num ?? 0}
            den={conversion?.meetings_from_conversations_den ?? 0}
          />
          <RateRow
            label="Experience → Conversations"
            num={conversion?.conversations_from_experiences_num ?? 0}
            den={conversion?.conversations_from_experiences_den ?? 0}
          />
        </div>
      </Card>

      {/* Inbound Chat Health */}
      <Card title="Inbound Chat Health Funnel">
        <div className="space-y-2">
          <Row label="Sessions with inbound chat requests" value={inbound?.requests ?? 0} />
          <Row label="Inbound requests where reps were available" value={inbound?.with_rep_available ?? 0} />
          <Row label="Inbound requests where rep started a conversation" value={inbound?.rep_started ?? 0} />
          <Row label="Rep started before wait time ended" value={inbound?.started_before_sla ?? 0} />
        </div>
      </Card>

      {/* Pounce Conversation Rate */}
      <Card title="Pounce Conversation Rate Funnel">
        <div className="space-y-4">
          <Row label="Rep pounce attempts" value={pounce?.attempts ?? 0} />
          <RateRow
            label="Pounce → Conversations"
            num={pounce?.conversations ?? 0}
            den={Math.max(pounce?.attempts ?? 0, 1)}
          />
          <RateRow
            label="Pounce → Meetings"
            num={pounce?.meetings ?? 0}
            den={Math.max(pounce?.attempts ?? 0, 1)}
          />
        </div>
      </Card>
    </div>
  );
}
