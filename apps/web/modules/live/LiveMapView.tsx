"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useOrganization } from "@clerk/nextjs";
import { api } from "@workspace/backend/_generated/api";
import LiveMap, { Visitor } from "./components/LiveMap";
import { LiveVisitorView } from "@/modules/dashboard/ui/components/live-visitor-view";
import { Id } from "@workspace/backend/_generated/dataModel";
import { SnapshotsStrip } from "../dashboard/ui/components/SnapshotsStrip";

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

  // ✅ IMPORTANT: backend already filters by rep territories
  const visitors = (useQuery(api.private.live.getActiveVisitors, {}) ?? []) as Visitor[];

  const filtered = useMemo(
    () => visitors.filter((v) => matches(v, query)),
    [visitors, query],
  );

  // One online visitor: select them immediately so the map zooms + Live View panel can load snapshots.
  useEffect(() => {
    if (filtered.length !== 1) return;
    const only = filtered[0]!;
    if (selectedId === only._id) return;
    setSelectedId(only._id);
  }, [filtered, selectedId]);

  const visitorsWithCoords = useMemo(
    () =>
      filtered.filter(
        (v) => typeof v.lat === "number" && typeof v.lng === "number",
      ),
    [filtered],
  );

  const selected = useMemo(
    () => filtered.find((v) => v._id === selectedId),
    [filtered, selectedId],
  );

  const selectedSessionId = selected?.contactSessionId
    ? (selected.contactSessionId as Id<"contactSessions">)
    : null;

  const latestSnap =
    useQuery(
      api.public.snapshots.listRecent,
      selectedSessionId ? { sessionId: selectedSessionId, limit: 1 } : "skip",
    ) ?? [];

  const currentUrlFromSnap = latestSnap[0]?.pageUrl;
  const headerUrl =
    (selected?.currentUrl ?? currentUrlFromSnap ?? "").split("?")[0] || "—";

  return (
    <div className="flex h-full w-full">
      {/* Left column */}
      <div className="w-[320px] border-r flex flex-col">
        <div className="p-3 border-b">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter: city, country, url, name, utm…"
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </div>

        <div className="p-2 text-xs text-muted-foreground">
          {filtered.length} online (your territory)
        </div>

        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              No active visitors assigned to your territory right now.
            </div>
          ) : null}

          {filtered.map((v) => (
            <button
              key={v._id}
              onClick={() => setSelectedId(v._id)}
              className="w-full text-left px-3 py-3 hover:bg-accent border-b"
              title={v.currentUrl || ""}
            >
              <div className="font-medium text-sm line-clamp-1">
                {v.name || "Visitor"}
              </div>
              <div className="text-xs text-muted-foreground line-clamp-1">
                {v.city}
                {v.countryCode ? `, ${v.countryCode}` : ""}
              </div>
              {v.currentUrl && (
                <div className="text-xs text-muted-foreground line-clamp-1">
                  {v.currentUrl}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Map — only visitors with lat/lng from IP geolocation render as pins */}
      <div className="relative flex-1 min-h-0">
        <LiveMap visitors={filtered} selectedId={selectedId} />
        {filtered.length > 0 && visitorsWithCoords.length === 0 ? (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 rounded-md border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
            No pins until we have coordinates (IP geolocation). Private or localhost IPs cannot be
            placed. Optional: set <code className="rounded bg-muted px-1">IPDATA_API_KEY</code> on
            Convex for ipdata; a fallback provider is used when it is not set.
          </div>
        ) : null}
      </div>

      {/* Right panel */}
      {selected && selectedSessionId && (
        <aside className="w-[35vw] max-w-[650px] border-l bg-background p-3 hidden xl:block">
          <div className="mb-2">
            <div className="text-sm font-medium">{selected.name || "Visitor"}</div>
            <div className="text-xs text-muted-foreground">
              {selected.city ?? "—"}
              {selected.countryCode ? `, ${selected.countryCode}` : ""} · {headerUrl}
            </div>
          </div>

          <LiveVisitorView
            orgId={orgId}
            sessionId={selectedSessionId}
            trackedPageUrl={selected.currentUrl}
          />
          <SnapshotsStrip sessionId={selectedSessionId} limit={6} />
        </aside>
      )}
    </div>
  );
}
