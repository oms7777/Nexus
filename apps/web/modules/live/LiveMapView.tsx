"use client";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import LiveMap, { Visitor } from "./components/LiveMap";

function matches(v: Visitor, q: string) {
  if (!q) return true;
  const s = q.toLowerCase();

  // extract UTM bits if present
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
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const visitors = useQuery(api.private.live.getActiveVisitors, {}) ?? [];

  const filtered = useMemo(
    () => visitors.filter((v) => matches(v as Visitor, query)),
    [visitors, query]
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
          {/* Optional: Save as routing rule later */}
          {/* <button className="mt-2 text-xs underline">Save as routing rule</button> */}
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
    </div>
  );
}
