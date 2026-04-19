"use client";

import React, { useMemo, useState } from "react";
import { Filter, HelpCircle, Search } from "lucide-react";

import { displaySourceLabel } from "@/modules/analytics/shared/source-labels";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";

type Row = {
  groupKey?: string;
  account: string;
  identityKind?: "account" | "company" | "domain" | "visitor" | "unknown";
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

/** Rows where we have a real account / company / work domain (not anonymous visitor bucket). */
function isNamedIdentity(r: Row): boolean {
  const k = r.identityKind ?? "unknown";
  return k === "account" || k === "company" || k === "domain";
}

function TierBadge({ value }: { value?: string }) {
  const v = (value ?? "Neutral").toLowerCase();
  const isHot = v === "hot";
  const isWarm = v === "warm";

  const label = isHot ? "Hot" : isWarm ? "Warm" : "Neutral";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        isHot
          ? "border-rose-200 bg-gradient-to-r from-rose-50 to-orange-50 text-rose-900 dark:border-rose-900/50 dark:from-rose-950/60 dark:to-orange-950/40 dark:text-rose-100"
          : isWarm
            ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/45 dark:bg-amber-950/40 dark:text-amber-100"
            : "border-border/80 bg-muted/70 text-muted-foreground",
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
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        isHigh
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/45 dark:bg-emerald-950/45 dark:text-emerald-100"
          : isMedium
            ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-900/45 dark:bg-fuchsia-950/40 dark:text-fuchsia-100"
            : "border-border/80 bg-muted/70 text-muted-foreground",
      ].join(" ")}
    >
      Intent: {label}
    </span>
  );
}

const SCORE_HELP =
  "Weighted blend of meetings (×50), conversations (×15), inbound requests (×8), sessions (×3), experiences (×1). Thresholds: Hot ≥120, Warm ≥45.";

function IdentityBadge({ kind }: { kind?: Row["identityKind"] }) {
  const k = kind ?? "unknown";
  const meta: Record<
    NonNullable<Row["identityKind"]>,
    { label: string; hint: string; cls: string }
  > = {
    account: {
      label: "CRM account",
      hint: "Events tied to a linked account record.",
      cls: "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/45 dark:bg-violet-950/40 dark:text-violet-100",
    },
    company: {
      label: "Company",
      hint: "Grouped by company name captured on the visitor.",
      cls: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/45 dark:bg-sky-950/35 dark:text-sky-100",
    },
    domain: {
      label: "Email domain",
      hint: "Grouped by domain from a captured work email.",
      cls: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/45 dark:bg-blue-950/35 dark:text-blue-100",
    },
    visitor: {
      label: "Anonymous ID",
      hint: "Browser visitor id only — no company or email domain yet.",
      cls: "border-border/90 bg-muted/90 text-muted-foreground",
    },
    unknown: {
      label: "Unattributed",
      hint: "Events we could not tie to account, company, domain, or visitor id.",
      cls: "border-border/90 bg-muted/90 text-muted-foreground",
    },
  };
  const m = meta[k];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={[
            "inline-flex max-w-[10rem] cursor-help truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            m.cls,
          ].join(" ")}
        >
          {m.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {m.hint}
      </TooltipContent>
    </Tooltip>
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
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [territoryFilter, setTerritoryFilter] = useState<string>("all");
  const [minScore, setMinScore] = useState<string>("0");
  /** `named` = hide visitor hashes + unattributed rollup; show CRM / company / email domain only. */
  const [identityFilter, setIdentityFilter] = useState<"all" | "named">("all");

  const territories = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const t = safeStr(r.territory);
      if (t) s.add(t);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const min = Number(minScore);
    const minOk = Number.isFinite(min) ? min : 0;

    let base = rows.slice();
    if (query) {
      base = base.filter((r) => safeStr(r.account).toLowerCase().includes(query));
    }
    if (tierFilter !== "all") {
      base = base.filter((r) => (r.tier ?? "Neutral").toLowerCase() === tierFilter.toLowerCase());
    }
    if (identityFilter === "named") {
      base = base.filter(isNamedIdentity);
    }
    if (territoryFilter !== "all" && advanced) {
      base = base.filter((r) => safeStr(r.territory) === territoryFilter);
    }
    if (minOk > 0) {
      base = base.filter((r) => safeNum(r.score) >= minOk);
    }

    base.sort((a, b) => {
      if (sortKey === "account") return safeStr(a.account).localeCompare(safeStr(b.account));
      if (sortKey === "sessions") return safeNum(b.sessions) - safeNum(a.sessions);
      if (sortKey === "meetings") return safeNum(b.meetings) - safeNum(a.meetings);
      return safeNum(b.score) - safeNum(a.score);
    });

    return base;
  }, [rows, q, sortKey, tierFilter, identityFilter, territoryFilter, minScore, advanced]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm ring-1 ring-black/[0.04] dark:ring-white/10">
      <div className="border-b border-border/70 bg-gradient-to-r from-fuchsia-50/50 to-rose-50/30 px-4 py-3 dark:from-fuchsia-950/20 dark:to-rose-950/10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search account, domain, or visitor…"
                className="h-10 rounded-xl border-border/80 bg-white pl-9 dark:bg-card"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Filter className="size-3.5" />
                Filters
              </span>
              <Select value={tierFilter} onValueChange={setTierFilter}>
                <SelectTrigger className="h-9 w-[120px] rounded-xl text-xs" size="sm">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  <SelectItem value="hot">Hot</SelectItem>
                  <SelectItem value="warm">Warm</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                </SelectContent>
              </Select>
              <Select value={identityFilter} onValueChange={(v) => setIdentityFilter(v as "all" | "named")}>
                <SelectTrigger className="h-9 min-w-[168px] rounded-xl text-xs" size="sm">
                  <SelectValue placeholder="Identity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All identities</SelectItem>
                  <SelectItem value="named">Named only</SelectItem>
                </SelectContent>
              </Select>
              {advanced ? (
                <Select value={territoryFilter} onValueChange={setTerritoryFilter}>
                  <SelectTrigger className="h-9 min-w-[140px] rounded-xl text-xs" size="sm">
                    <SelectValue placeholder="Territory" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All territories</SelectItem>
                    {territories.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Select value={minScore} onValueChange={setMinScore}>
                <SelectTrigger className="h-9 w-[130px] rounded-xl text-xs" size="sm">
                  <SelectValue placeholder="Min score" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Any score</SelectItem>
                  <SelectItem value="45">≥ 45 (Warm+)</SelectItem>
                  <SelectItem value="120">≥ 120 (Hot)</SelectItem>
                </SelectContent>
              </Select>
              {(tierFilter !== "all" ||
                territoryFilter !== "all" ||
                minScore !== "0" ||
                identityFilter !== "all" ||
                q) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 rounded-xl text-xs"
                  onClick={() => {
                    setTierFilter("all");
                    setTerritoryFilter("all");
                    setMinScore("0");
                    setIdentityFilter("all");
                    setQ("");
                  }}
                >
                  Reset
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort</span>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-9 w-[148px] rounded-xl text-xs" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Score</SelectItem>
                <SelectItem value="sessions">Sessions</SelectItem>
                <SelectItem value="meetings">Meetings</SelectItem>
                <SelectItem value="account">Account</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div
        className={[
          "grid gap-3 border-b border-border/60 bg-muted/25 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
          advanced
            ? "grid-cols-[minmax(0,2fr)_auto_auto_auto_auto_auto_auto]"
            : "grid-cols-[minmax(0,2fr)_auto_auto_auto_auto]",
        ].join(" ")}
      >
        <div>Account</div>
        <div>Tier</div>
        <div>Intent</div>
        <div className="inline-flex items-center gap-1">
          Score
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="rounded-md p-0.5 text-muted-foreground hover:text-foreground">
                <HelpCircle className="size-3.5" aria-label="How score works" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
              {SCORE_HELP}
            </TooltipContent>
          </Tooltip>
        </div>
        <div>Sessions</div>
        {advanced ? <div>Territory</div> : null}
        {advanced ? <div>Source</div> : null}
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-medium text-foreground">No matching accounts</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {identityFilter === "named"
              ? "No CRM, company, or email-domain groups in this range — try “All identities” or widen the period."
              : "Relax filters or widen the date range."}
          </p>
        </div>
      ) : (
        filtered.map((row) => (
          <div
            key={row.groupKey ?? row.account}
            className={[
              "grid gap-3 border-b border-border/50 px-4 py-3.5 transition last:border-0 items-center hover:bg-fuchsia-50/40 dark:hover:bg-fuchsia-950/15",
              advanced
                ? "grid-cols-[minmax(0,2fr)_auto_auto_auto_auto_auto_auto]"
                : "grid-cols-[minmax(0,2fr)_auto_auto_auto_auto]",
            ].join(" ")}
          >
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate font-medium text-foreground">{row.account}</span>
                <IdentityBadge kind={row.identityKind} />
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {(row.reasons ?? []).slice(0, 3).join(" · ") || "—"}
              </div>
            </div>

            <div>
              <TierBadge value={row.tier} />
            </div>

            <div>
              <IntentBadge value={row.intent} />
            </div>

            <div className="tabular-nums text-sm font-semibold text-foreground">{safeNum(row.score).toLocaleString()}</div>

            <div className="tabular-nums text-sm font-medium">{safeNum(row.sessions).toLocaleString()}</div>

            {advanced ? (
              <div className="truncate text-sm text-muted-foreground">{row.territory ?? "—"}</div>
            ) : null}
            {advanced ? (
              <div className="truncate text-sm font-medium text-foreground" title={row.source ?? "direct"}>
                {displaySourceLabel(row.source ?? "direct")}
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
