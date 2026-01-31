// apps/web/modules/live/LiveMapView.tsx (ou ton chemin exact)
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useOrganization, useAuth } from "@clerk/nextjs";
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

  const haystack = [v.name, v.email, v.city, v.countryCode, v.currentUrl, v.assignedTerritoryKey, ...utm]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(s);
}

export default function LiveMapView() {
  const { organization } = useOrganization();
  const { userId } = useAuth();

  const orgId = organization?.id || "";
  const myUserId = userId || "";

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const visitors = (useQuery(api.private.live.getActiveVisitors, {}) ?? []) as Visitor[];

  // ✅ 1) assignment filter (rep sees only his territory)
  const mine = useMemo(() => {
    if (!myUserId) return [];
    return visitors.filter((v) => {
      const repId = v.assignedRepUserId ?? v.assignedRep?.userId;
      return repId === myUserId;
    });
  }, [visitors, myUserId]);

  // ✅ 2) search filter after assignment
  const filtered = useMemo(() => mine.filter((v) => matches(v, query)), [mine, query]);

  const selected = useMemo(() => filtered.find((v) => v._id === selectedId), [filtered, selectedId]);

  // currentUrl source of truth from last snapshot
  const selectedSessionId = selected?.contactSessionId
    ? (selected.contactSessionId as Id<"contactSessions">)
    : null;

  const latestSnap =
    (useQuery(
      api.public.snapshots.listRecent,
      selectedSessionId ? { sessionId: selectedSessionId, limit: 1 } : "skip",
    ) as any[]) ?? [];

  const currentUrlFromSnap = latestSnap[0]?.pageUrl;
  const headerUrl = (currentUrlFromSnap ?? selected?.currentUrl ?? "").split("?")[0] || "—";

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
          {filtered.map((v) => (
            <button
              key={v._id}
              onClick={() => setSelectedId(v._id)}
              className="w-full text-left px-3 py-3 hover:bg-accent border-b"
              title={v.currentUrl || ""}
            >
              <div className="font-medium text-sm line-clamp-1">{v.name || "Visitor"}</div>
              <div className="text-xs text-muted-foreground line-clamp-1">
                {v.city}
                {v.countryCode ? `, ${v.countryCode}` : ""}{" "}
                {v.assignedTerritoryKey ? `· ${v.assignedTerritoryKey}` : ""}
              </div>
              {v.currentUrl && (
                <div className="text-xs text-muted-foreground line-clamp-1">{v.currentUrl}</div>
              )}
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              No active visitors assigned to your territory right now.
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
        <LiveMap
          visitors={visitors}
          myUserId={myUserId}
          selectedId={selectedId}
          onSelectId={(id) => setSelectedId(id)}
        />
      </div>

      {/* Right panel (live stream) */}
      {selected && selectedSessionId && (
        <aside className="w-[35vw] max-w-[650px] border-l bg-background p-3 hidden xl:block">
          <div className="mb-2">
            <div className="text-sm font-medium">{selected.name || "Visitor"}</div>
            <div className="text-xs text-muted-foreground">
              {selected.city ?? "—"}
              {selected.countryCode ? `, ${selected.countryCode}` : ""} · {headerUrl}
              {selected.assignedTerritoryKey ? ` · ${selected.assignedTerritoryKey}` : ""}
            </div>
          </div>

          <LiveVisitorView orgId={orgId} sessionId={selectedSessionId} />

          <SnapshotsStrip sessionId={selectedSessionId} limit={6} />
        </aside>
      )}
    </div>
  );
}
