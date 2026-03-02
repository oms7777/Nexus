"use client";

import React, { useMemo, useState } from "react";

type Row = {
  account: string;
  tier?: "Hot" | "Warm" | "Neutral" | string;
  score?: number;
  intent?: "High" | "Medium" | "Low" | string;

  sessions?: number;
  conversations?: number;
  meetings?: number;
  inboundRequests?: number;
  experiences?: number;

  source?: string;
  territory?: string;
  countryCode?: string;
  city?: string;

  topPages?: string[];
  reasons?: string[];
  lastSeenTs?: number;
};

type SortKey = "score" | "sessions" | "meetings" | "account";

function safeStr(x: any) {
  return typeof x === "string" ? x : "";
}
function safeNum(x: any) {
  const n = Number(x ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function TierBadge({ value }: { value?: string }) {
  const v = (value ?? "Neutral").toLowerCase();
  const isHot = v === "hot";
  const isWarm = v === "warm";

  const label = isHot ? "Hot" : isWarm ? "Warm" : "Neutral";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        isHot ? "bg-red-50" : isWarm ? "bg-amber-50" : "bg-muted",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function IntentBadge({ value }: { value?: string }) {
  const v = (value ?? "Low").toLowerCase();
  const isHigh = v === "high";
  const isMedium = v === "medium";
  const label = isHigh ? "High" : isMedium ? "Medium" : "Low";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        isHigh ? "bg-emerald-50" : isMedium ? "bg-fuchsia-50" : "bg-muted",
      ].join(" ")}
    >
      Intent: {label}
    </span>
  );
}

export function SignalsTable({
  rows,
  advanced,
}: {
  rows: Row[];
  advanced: boolean;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    const base = query
      ? rows.filter((r) => safeStr(r.account).toLowerCase().includes(query))
      : rows.slice();

    base.sort((a, b) => {
      if (sortKey === "account") return safeStr(a.account).localeCompare(safeStr(b.account));
      if (sortKey === "sessions") return safeNum(b.sessions) - safeNum(a.sessions);
      if (sortKey === "meetings") return safeNum(b.meetings) - safeNum(a.meetings);
      return safeNum(b.score) - safeNum(a.score);
    });

    return base;
  }, [rows, q, sortKey]);

  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      {/* controls */}
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search account…"
            className="h-10 w-full sm:w-72 rounded-xl border bg-white px-3 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort</span>
          <select
            className="h-10 rounded-xl border bg-white px-3 text-sm"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="score">Score</option>
            <option value="sessions">Sessions</option>
            <option value="meetings">Meetings</option>
            <option value="account">Account</option>
          </select>
        </div>
      </div>

      {/* header */}
      <div
        className={[
          "grid gap-3 border-b px-4 py-2 text-xs text-muted-foreground uppercase",
          advanced
            ? "grid-cols-[2.2fr_0.8fr_1fr_0.9fr_0.8fr_1fr_1fr]"
            : "grid-cols-[2.2fr_0.8fr_1fr_0.9fr_0.8fr]",
        ].join(" ")}
      >
        <div>Account</div>
        <div>Tier</div>
        <div>Intent</div>
        <div>Score</div>
        <div>Sessions</div>
        {advanced ? <div>Territory</div> : null}
        {advanced ? <div>Source</div> : null}
      </div>

      {/* rows */}
      {filtered.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">No results.</div>
      ) : (
        filtered.map((row) => (
          <div
            key={row.account}
            className={[
              "grid gap-3 px-4 py-3 border-b last:border-0 items-center",
              advanced
                ? "grid-cols-[2.2fr_0.8fr_1fr_0.9fr_0.8fr_1fr_1fr]"
                : "grid-cols-[2.2fr_0.8fr_1fr_0.9fr_0.8fr]",
            ].join(" ")}
          >
            <div className="min-w-0">
              <div className="font-medium truncate">{row.account}</div>
              <div className="mt-1 text-xs text-muted-foreground truncate">
                {(row.reasons ?? []).slice(0, 3).join(" • ") || "—"}
              </div>
            </div>

            <div>
              <TierBadge value={row.tier} />
            </div>

            <div>
              <IntentBadge value={row.intent} />
            </div>

            <div className="tabular-nums text-sm font-medium">
              {safeNum(row.score).toLocaleString()}
            </div>

            <div className="tabular-nums text-sm font-medium">
              {safeNum(row.sessions).toLocaleString()}
            </div>

            {advanced ? <div className="text-sm">{row.territory ?? "—"}</div> : null}
            {advanced ? <div className="text-sm">{row.source ?? "direct"}</div> : null}
          </div>
        ))
      )}
    </div>
  );
}
