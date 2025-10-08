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

export default function AnalyticsOverviewPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { fromTs, toTs } = useStableRange(30);

  const data = useQuery(
    api.public.analytics.overview,
    orgId ? { organizationId: orgId, fromTs, toTs } : "skip"
  );

  if (!orgId) return <div className="p-6">No organization</div>;
  if (data === undefined) return <div className="p-6">Loading…</div>;

  const cards: Array<[string, number]> = [
    ["Sessions", data.sessions],
    ["Received an Experience", data.experiences],
    ["Inbound Chat Requested", data.inbound_requests],
    ["Pounce Attempts", data.pounce_attempts],
    ["Conversations", data.conversations],
    ["Meetings Booked", data.meetings],
  ];

  return (
    <div className="p-6 grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-4xl font-semibold mt-2">
            {value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
