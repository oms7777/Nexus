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

export default function AnalyticsSignalsPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { fromTs, toTs } = useStableRange(30);

  const list = useQuery(
    api.public.analytics.signals,
    orgId ? { organizationId: orgId, fromTs, toTs } : "skip"
  );

  if (!orgId) return <div className="p-6">No organization</div>;
  if (list === undefined) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6">
      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 border-b px-4 py-2 text-xs text-muted-foreground uppercase">
          <div>Account</div>
          <div>Engagement</div>
          <div>Time on site</div>
          <div>Sessions</div>
        </div>
        {list.map((row) => (
          <div
            key={row.account}
            className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-4 py-3 border-b last:border-0"
          >
            <div className="font-medium">{row.account}</div>
            <div>{row.engagement}</div>
            <div>{row.timeOnSite}</div>
            <div className="tabular-nums">{row.sessions.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
