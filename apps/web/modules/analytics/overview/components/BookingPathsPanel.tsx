"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";

import { displaySourceLabel } from "@/modules/analytics/shared/source-labels";
import { CardShell } from "@/modules/analytics/shared/analytics-primitives";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";

export type BookingPath = {
  source: string;
  page: string;
  sessions: number;
  conversations: number;
  meetings: number;
  meetingRate: number;
  conversationIds?: string[];
};

const MAX_BOOKED = 5;
const MAX_ZERO_PREVIEW = 3;

/** Page-first label: hide "Direct →" noise; keep real channels (LinkedIn, Ads…). */
function pathTitle(p: BookingPath): string {
  const page = p.page || "/";
  const pageLabel = page === "/" ? "Homepage (/)" : page;
  const src = String(p.source ?? "").toLowerCase().trim();
  if (!src || src === "direct") return pageLabel;
  return `${displaySourceLabel(p.source)} → ${pageLabel}`;
}

/**
 * Booked paths first, then zero-meeting pages by traffic.
 * Preview shows a few zeros; the rest expand on demand.
 */
function selectPaths(paths: BookingPath[]): {
  booked: BookingPath[];
  zeroPreview: BookingPath[];
  zeroRest: BookingPath[];
} {
  const list = (paths ?? []).filter((p) => p.sessions > 0 || p.meetings > 0);
  const booked = list
    .filter((p) => p.meetings > 0)
    .sort(
      (a, b) =>
        b.meetings - a.meetings || b.meetingRate - a.meetingRate || b.sessions - a.sessions,
    )
    .slice(0, MAX_BOOKED);

  const bookedKeys = new Set(booked.map((p) => `${p.source}\0${p.page}`));
  const zeros = list
    .filter((p) => p.meetings === 0 && !bookedKeys.has(`${p.source}\0${p.page}`))
    .sort((a, b) => b.sessions - a.sessions);

  return {
    booked,
    zeroPreview: zeros.slice(0, MAX_ZERO_PREVIEW),
    zeroRest: zeros.slice(MAX_ZERO_PREVIEW),
  };
}

function PathRow({
  p,
  maxMeetings,
  onSelect,
}: {
  p: BookingPath;
  maxMeetings: number;
  onSelect: (p: BookingPath) => void;
}) {
  const ratePct = (Number(p.meetingRate ?? 0) * 100).toFixed(1);
  const bar = (p.meetings / maxMeetings) * 100;
  const muted = p.meetings === 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(p)}
      className={[
        "group relative w-full overflow-hidden rounded-xl border px-3 py-3 text-left transition",
        muted
          ? "border-border/50 bg-muted/15 opacity-80 hover:opacity-100"
          : "border-fuchsia-200/70 bg-gradient-to-r from-fuchsia-50/80 to-white hover:border-fuchsia-300 dark:from-fuchsia-950/30 dark:to-card",
      ].join(" ")}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 bg-fuchsia-200/40 dark:bg-fuchsia-800/30"
        style={{ width: `${Math.max(muted ? 0 : 8, bar)}%` }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{pathTitle(p)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {muted ? (
              <>Traffic without meetings · {p.sessions.toLocaleString()} sessions</>
            ) : (
              <>
                <span className="font-semibold text-foreground">{ratePct}%</span> meeting rate ·{" "}
                {p.conversations.toLocaleString()} conv · {p.sessions.toLocaleString()} sessions
              </>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-semibold tabular-nums text-foreground">
            {p.meetings.toLocaleString()}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">meetings</div>
        </div>
      </div>
    </button>
  );
}

export function BookingPathsPanel({
  paths,
  showPlanBadge,
}: {
  paths: BookingPath[];
  showPlanBadge?: React.ReactNode;
}) {
  const [selected, setSelected] = useState<BookingPath | null>(null);
  const [showMoreZeros, setShowMoreZeros] = useState(false);
  const { booked, zeroPreview, zeroRest } = useMemo(() => selectPaths(paths), [paths]);

  const visible = useMemo(
    () => [...booked, ...zeroPreview, ...(showMoreZeros ? zeroRest : [])],
    [booked, zeroPreview, zeroRest, showMoreZeros],
  );

  const maxMeetings = Math.max(1, ...visible.map((r) => r.meetings), 1);
  const hasCampaignChannel = visible.some((p) => {
    const s = String(p.source ?? "").toLowerCase();
    return s && s !== "direct";
  });

  return (
    <>
      <CardShell
        title="Pages that book"
        subtitle="Top converting pages — click a row for conversations"
        right={showPlanBadge}
      >
        {hasCampaignChannel ? (
          <p className="mb-3 text-xs text-muted-foreground">
            When a campaign is detected (UTM / LinkedIn / Ads), it appears before the page.
          </p>
        ) : null}

        {booked.length + zeroPreview.length === 0 ? (
          <p className="text-sm text-muted-foreground">No page activity in this period yet.</p>
        ) : (
          <div className="space-y-2">
            {visible.map((p) => (
              <PathRow
                key={`${p.source}|${p.page}`}
                p={p}
                maxMeetings={maxMeetings}
                onSelect={setSelected}
              />
            ))}
            {zeroRest.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowMoreZeros((v) => !v)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/70 px-3 py-2.5 text-xs font-medium text-muted-foreground transition hover:border-fuchsia-200 hover:bg-fuchsia-50/40 hover:text-foreground"
              >
                <ChevronDown
                  className={[
                    "size-3.5 transition-transform",
                    showMoreZeros ? "rotate-180" : "",
                  ].join(" ")}
                />
                {showMoreZeros
                  ? "Hide other pages"
                  : `Show ${zeroRest.length} more page${zeroRest.length === 1 ? "" : "s"} with traffic, 0 meetings`}
              </button>
            ) : null}
          </div>
        )}
      </CardShell>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Page detail</SheetTitle>
            <SheetDescription>
              {selected ? pathTitle(selected) : "Conversation links for this page"}
            </SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="space-y-4 px-4 pb-6">
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Meetings" value={selected.meetings} />
                <Metric label="Conversations" value={selected.conversations} />
                <Metric label="Sessions" value={selected.sessions} />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Conversations
                </div>
                {(selected.conversationIds?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No conversation ids on events for this page yet. Open Inbox to find related
                    threads.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {selected.conversationIds!.map((id) => (
                      <li key={id}>
                        <Link
                          href={`/conversations/${id}`}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-fuchsia-700 hover:underline dark:text-fuchsia-300"
                        >
                          Open conversation
                          <ArrowUpRight className="size-3.5" />
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {id.slice(-8)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Link
                href="/conversations"
                className="inline-flex text-sm text-muted-foreground hover:text-foreground"
              >
                Browse all conversations →
              </Link>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-muted/30 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}
