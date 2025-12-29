"use client";

import React, { useMemo, useState } from "react";
import { SignalBadge } from "./SignalBadge";

type Row = {
  account: string;
  engagement: string;
  timeOnSite: string;
  sessions: number;

  // advanced (optionnels)
  countryCode?: string;
  city?: string;
  utm_source?: string;
  territory?: string;
};

type SortKey = "sessions" | "account";

function safeStr(x: any) {
  return typeof x === "string" ? x : "";
}

function safeNum(x: any) {
  const n = Number(x ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function SignalsTable({
  rows,
  advanced,
}: {
  rows: Row[];
  advanced: boolean;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("sessions");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    const base = query
      ? rows.filter((r) => safeStr(r.account).toLowerCase().includes(query))
      : rows.slice();

    base.sort((a, b) => {
      if (sortKey === "account") return safeStr(a.account).localeCompare(safeStr(b.account));
      return safeNum(b.sessions) - safeNum(a.sessions);
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
            <option value="sessions">Sessions</option>
            <option value="account">Account</option>
          </select>
        </div>
      </div>

      {/* header */}
      <div
        className={[
          "grid gap-3 border-b px-4 py-2 text-xs text-muted-foreground uppercase",
          advanced
            ? "grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]"
            : "grid-cols-[2fr_1fr_1fr_1fr]",
        ].join(" ")}
      >
        <div>Account</div>
        <div>Engagement</div>
        {advanced ? <div>Territory</div> : null}
        {advanced ? <div>UTM</div> : null}
        <div>Time on site</div>
        <div>Sessions</div>
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
                ? "grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]"
                : "grid-cols-[2fr_1fr_1fr_1fr]",
            ].join(" ")}
          >
            <div className="font-medium truncate">{row.account}</div>
            <div>
              <SignalBadge value={row.engagement} />
            </div>

            {advanced ? <div className="text-sm">{row.territory ?? "—"}</div> : null}
            {advanced ? <div className="text-sm">{row.utm_source ?? "—"}</div> : null}

            <div className="text-sm">{row.timeOnSite ?? "—"}</div>
            <div className="tabular-nums text-sm font-medium">
              {safeNum(row.sessions).toLocaleString()}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
