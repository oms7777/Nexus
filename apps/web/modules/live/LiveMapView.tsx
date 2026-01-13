"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useOrganization } from "@clerk/nextjs";
import { api } from "@workspace/backend/_generated/api";
import LiveMap, { Visitor } from "./components/LiveMap";
import { LiveVisitorView } from "@/modules/dashboard/ui/components/live-visitor-view";
import { Id } from "@workspace/backend/_generated/dataModel";
// import { SnapshotsStrip } from "@/modules/dashboard/ui/components/SnapshotsStrip"; // optionnel

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
  const visitors = useQuery(api.private.live.getActiveVisitors, {}) ?? [];

  const filtered = useMemo(
    () => visitors.filter((v) => matches(v as Visitor, query)),
    [visitors, query]
  );

  const selected = useMemo(
    () => filtered.find((v) => v._id === selectedId),
    [filtered, selectedId]
  );

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
          {filtered.length} online
        </div>
        <div className="flex-1 overflow-auto">
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

      {/* Map */}
      <div className="flex-1">
        <LiveMap visitors={filtered as Visitor[]} selectedId={selectedId} />
      </div>

      {/* Right panel (live stream) */}
      {selected && (
        <aside className="w-[420px] border-l bg-background p-3 hidden xl:block">
          <div className="mb-2">
            <div className="text-sm font-medium">{selected.name || "Visitor"}</div>
            <div className="text-xs text-muted-foreground">
              {selected.city ?? "—"}
              {selected.countryCode ? `, ${selected.countryCode}` : ""} ·{" "}
              {selected.currentUrl?.split("?")[0] ?? "—"}
            </div>
          </div>

          <LiveVisitorView
            orgId={orgId}
            sessionId={selected.contactSessionId as Id<"contactSessions">}
          />

          {/* Optionnel */}
          {/* <SnapshotsStrip sessionId={selected.contactSessionId as any} limit={6} /> */}
        </aside>
      )}
    </div>
  );
}
