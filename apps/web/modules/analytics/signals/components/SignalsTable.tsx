"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, HelpCircle, Search } from "lucide-react";

import { displaySourceLabel } from "@/modules/analytics/shared/source-labels";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
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
  companyName?: string;
  workDomain?: string;
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
  sparkline?: number[];
};

type SortKey = "score" | "sessions" | "meetings" | "account" | "lastSeen";

type SignalsPreset = "all" | "hot" | "warm_plus";

export type SignalsAudience = "companies" | "domains";

function safeStr(x: any) {
  return typeof x === "string" ? x : "";
}
function safeNum(x: any) {
  const n = Number(x ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isUnattributedRow(r: Row) {
  return r.groupKey === "unknown" || (r.identityKind ?? "") === "unknown";
}

/** Heuristic filter for fake / test “company” strings typed in booking forms. */
function isGarbageCompanyRow(r: Row): boolean {
  if (r.identityKind !== "company") return false;
  const name = (r.companyName ?? r.account ?? "").trim().toLowerCase();
  if (name.length <= 2) return true;
  if (/^(.)\1{2,}$/.test(name)) return true;
  const block = new Set([
    "test",
    "none",
    "n/a",
    "na",
    "null",
    "unknown",
    "asdf",
    "qwerty",
    "qqq",
    "xxx",
    "hhh",
    "daf",
    "ads",
    "sqd",
    "dkf",
    "sd",
    "lol",
    "foo",
    "bar",
    "abc",
    "xyz",
  ]);
  if (block.has(name)) return true;
  return false;
}

function formatRelativeShort(ts?: number) {
  if (!ts) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function organizationPrimaryLabel(r: Row) {
  if (safeStr(r.companyName)) return safeStr(r.companyName);
  if (safeStr(r.workDomain)) return safeStr(r.workDomain);
  return safeStr(r.account) || "—";
}

function ActivitySparkline({
  values,
  identityKind,
}: {
  values: number[];
  identityKind?: Row["identityKind"];
}) {
  const k = identityKind ?? "unknown";
  if (k === "visitor" || k === "unknown") {
    return (
      <p className="mt-2 max-w-[15rem] text-[10px] leading-snug text-muted-foreground">
        No account-level timeline for anonymous or unattributed traffic.
      </p>
    );
  }
  const sum = values.reduce((a, b) => a + Number(b ?? 0), 0);
  if (!values.length || sum <= 0) return null;
  const max = Math.max(1, ...values);
  const w = 112;
  const h = 30;
  const n = values.length;
  const step = n <= 1 ? w : w / (n - 1);
  const pts = values.map((v, i) => {
    const x = Math.round(i * step);
    const y = Math.round(h - 4 - (v / max) * (h - 8));
    return `${x},${y}`;
  });
  return (
    <div className="mt-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="rounded-lg border border-fuchsia-100/80 bg-gradient-to-b from-fuchsia-50/80 to-white/90 px-1.5 py-1 shadow-sm dark:border-fuchsia-900/40 dark:from-fuchsia-950/30 dark:to-card/90"
          >
            <svg width={w} height={h} className="text-fuchsia-600 dark:text-fuchsia-400" aria-hidden>
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={pts.join(" ")}
              />
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          One point per day in the selected range. Height uses the same weights as Score (meetings, conversations,
          inbound, sessions, experiences).
        </TooltipContent>
      </Tooltip>
      <div className="mt-0.5 text-[10px] text-muted-foreground">Daily signal (weighted)</div>
    </div>
  );
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
  audience,
}: {
  rows: Row[];
  advanced: boolean;
  audience: SignalsAudience;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawPreset = searchParams.get("preset");
  const preset: SignalsPreset =
    rawPreset === "hot" || rawPreset === "warm_plus" ? rawPreset : "all";

  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [territoryFilter, setTerritoryFilter] = useState<string>("all");
  const [minScore, setMinScore] = useState<string>("0");
  const [showUnattributed, setShowUnattributed] = useState(false);
  const [hideJunkCompanies, setHideJunkCompanies] = useState(true);

  const applyPresetToFilters = (p: SignalsPreset) => {
    if (p === "all") {
      setTierFilter("all");
      setMinScore("0");
    } else if (p === "hot") {
      setTierFilter("hot");
      setMinScore("0");
    } else if (p === "warm_plus") {
      setTierFilter("all");
      setMinScore("45");
    }
  };

  const setPreset = (p: SignalsPreset) => {
    applyPresetToFilters(p);
    const n = new URLSearchParams(searchParams.toString());
    if (p === "all") n.delete("preset");
    else n.set("preset", p);
    const qs = n.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  useEffect(() => {
    const raw = searchParams.get("preset");
    applyPresetToFilters(raw === "hot" || raw === "warm_plus" ? raw : "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate saved view from URL once
  }, []);

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

    if (audience === "companies") {
      base = base.filter((r) => r.identityKind === "company" || r.identityKind === "account");
    } else {
      base = base.filter((r) => r.identityKind === "domain");
    }

    if (audience === "companies" && hideJunkCompanies) base = base.filter((r) => !isGarbageCompanyRow(r));
    if (!showUnattributed) base = base.filter((r) => !isUnattributedRow(r));
    if (query) {
      base = base.filter((r) => {
        const blob = [r.account, r.companyName, r.workDomain].map((x) => safeStr(x).toLowerCase()).join(" ");
        return blob.includes(query);
      });
    }
    if (tierFilter !== "all") {
      base = base.filter((r) => (r.tier ?? "Neutral").toLowerCase() === tierFilter.toLowerCase());
    }
    if (territoryFilter !== "all" && advanced) {
      base = base.filter((r) => safeStr(r.territory) === territoryFilter);
    }
    if (minOk > 0) {
      base = base.filter((r) => safeNum(r.score) >= minOk);
    }

    base.sort((a, b) => {
      if (sortKey === "account")
        return organizationPrimaryLabel(a).localeCompare(organizationPrimaryLabel(b));
      if (sortKey === "sessions") return safeNum(b.sessions) - safeNum(a.sessions);
      if (sortKey === "meetings") return safeNum(b.meetings) - safeNum(a.meetings);
      if (sortKey === "lastSeen") return safeNum(b.lastSeenTs) - safeNum(a.lastSeenTs);
      return safeNum(b.score) - safeNum(a.score);
    });

    return base;
  }, [rows, q, sortKey, tierFilter, territoryFilter, minScore, advanced, hideJunkCompanies, showUnattributed, audience]);

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
                placeholder="Search company, domain, or account…"
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
                showUnattributed ||
                !hideJunkCompanies ||
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
                    setShowUnattributed(false);
                    setHideJunkCompanies(true);
                    setQ("");
                    router.replace(pathname, { scroll: false });
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
              <SelectTrigger className="h-9 w-[168px] rounded-xl text-xs" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Score</SelectItem>
                <SelectItem value="sessions">Sessions</SelectItem>
                <SelectItem value="meetings">Meetings</SelectItem>
                <SelectItem value="lastSeen">Last activity</SelectItem>
                <SelectItem value="account">Account</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/10 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Views</span>
        {(
          [
            { id: "all" as const, label: "All tiers" },
            { id: "hot" as const, label: "Hot" },
            { id: "warm_plus" as const, label: "Warm+" },
          ] as const
        ).map((v) => {
          const active = preset === v.id;
          return (
            <Button
              key={v.id}
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => setPreset(v.id)}
            >
              {v.label}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/60 bg-muted/10 px-4 py-2.5">
        {audience === "companies" ? (
          <div className="flex items-center gap-2">
            <Checkbox
              id="sig-hide-junk"
              checked={hideJunkCompanies}
              onCheckedChange={(v) => setHideJunkCompanies(v === true)}
            />
            <Label htmlFor="sig-hide-junk" className="cursor-pointer text-xs text-muted-foreground">
              Hide junk “company” names
            </Label>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Checkbox
            id="sig-show-unknown"
            checked={showUnattributed}
            onCheckedChange={(v) => setShowUnattributed(v === true)}
          />
          <Label htmlFor="sig-show-unknown" className="cursor-pointer text-xs text-muted-foreground">
            Show unattributed bucket
          </Label>
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
        <div>Organization</div>
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
            {audience === "companies"
              ? "No company rows in this range — try the Email domains tab or widen the period."
              : "No email-domain groups in this range — widen the period or capture emails on events."}
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
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold tracking-tight text-foreground">
                    {organizationPrimaryLabel(row)}
                  </div>
                  {safeStr(row.companyName) && safeStr(row.account) !== safeStr(row.companyName) ? (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{row.account}</div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <IdentityBadge kind={row.identityKind} />
                  <span className="text-[10px] tabular-nums text-muted-foreground" title="Most recent event in range">
                    {formatRelativeShort(row.lastSeenTs)}
                  </span>
                </div>
              </div>
              {row.sparkline && row.sparkline.length ? (
                <ActivitySparkline values={row.sparkline} identityKind={row.identityKind} />
              ) : null}
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
