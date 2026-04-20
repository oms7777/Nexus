"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useOrganization } from "@clerk/nextjs";
import { api } from "@workspace/backend/_generated/api";
import LiveMap from "./components/LiveMap";
import type { Visitor } from "./components/LiveMap";
import { LiveVisitorStreamCard } from "./components/LiveVisitorStreamCard";

function matches(v: Visitor, q: string) {
  if (!q) return true;
  const s = q.toLowerCase();

  let utm: string[] = [];
  if (v.currentUrl) {
    try {
      const u = new URL(v.currentUrl);
      const p = u.searchParams;
      utm = [
        p.get("utm_source") || "",
        p.get("utm_medium") || "",
        p.get("utm_campaign") || "",
        p.get("utm_term") || "",
        p.get("utm_content") || "",
      ].filter(Boolean);
    } catch {}
  }

  const haystack = [
    v.name,
    v.email,
    v.city,
    v.countryCode,
    v.currentUrl,
    ...utm,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(s);
}

export default function LiveMapView() {
  const { organization } = useOrganization();
  const orgId = organization?.id || "";

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const visitors = (useQuery(api.private.live.getActiveVisitors, {}) ?? []) as Visitor[];

  const filtered = useMemo(() => visitors.filter((v) => matches(v, query)), [visitors, query]);

  useEffect(() => {
    if (filtered.length !== 1) return;
    const only = filtered[0]!;
    if (selectedId === only._id) return;
    setSelectedId(only._id);
  }, [filtered, selectedId]);

  const visitorsWithCoords = useMemo(
    () => filtered.filter((v) => typeof v.lat === "number" && typeof v.lng === "number"),
    [filtered],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1">
      {/* Left — Qualified-style visitor stream */}
      <div className="flex w-full min-w-[300px] max-w-md shrink-0 flex-col border-r border-border bg-muted/10">
        <div className="border-b bg-background p-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter: city, country, url, name, utm…"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm shadow-sm"
          />
        </div>

        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          {filtered.length} online (your territory)
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No active visitors assigned to your territory right now.
            </div>
          ) : null}

          {filtered.map((v) => (
            <LiveVisitorStreamCard
              key={v._id}
              visitor={v}
              orgId={orgId}
              isSelected={selectedId === v._id}
              onSelect={() => setSelectedId(v._id)}
            />
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="relative min-h-0 flex-1">
        <LiveMap visitors={filtered} selectedId={selectedId} />
        {filtered.length > 0 && visitorsWithCoords.length === 0 ? (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 rounded-md border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
            No pins until we have coordinates (IP geolocation). Private or localhost IPs cannot be placed. Optional: set{" "}
            <code className="rounded bg-muted px-1">IPDATA_API_KEY</code> on Convex for ipdata; a fallback provider is used
            when it is not set.
          </div>
        ) : null}
      </div>
    </div>
  );
}
