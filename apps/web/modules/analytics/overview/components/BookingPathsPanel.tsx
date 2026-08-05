"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

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

export function BookingPathsPanel({
  paths,
  showPlanBadge,
}: {
  paths: BookingPath[];
  showPlanBadge?: React.ReactNode;
}) {
  const [selected, setSelected] = useState<BookingPath | null>(null);

  const rows = useMemo(() => {
    return (paths ?? []).filter((p) => p.sessions > 0 || p.meetings > 0).slice(0, 10);
  }, [paths]);

  const maxMeetings = Math.max(1, ...rows.map((r) => r.meetings));

  return (
    <>
      <CardShell
        title="Paths that book"
        subtitle="Ranked by meetings, then meeting rate — not raw session volume"
        right={showPlanBadge}
      >
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attributed paths in this period yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((p) => {
              const ratePct = (Number(p.meetingRate ?? 0) * 100).toFixed(1);
              const bar = (p.meetings / maxMeetings) * 100;
              const muted = p.meetings === 0;
              return (
                <button
                  key={`${p.source}|${p.page}`}
                  type="button"
                  onClick={() => setSelected(p)}
                  className={[
                    "group relative w-full overflow-hidden rounded-xl border px-3 py-3 text-left transition",
                    muted
                      ? "border-border/50 bg-muted/20 opacity-70 hover:opacity-90"
                      : "border-border/70 bg-white hover:border-fuchsia-200 hover:bg-fuchsia-50/40 dark:bg-card",
                  ].join(" ")}
                >
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-fuchsia-100/80 to-transparent dark:from-fuchsia-950/40"
                    style={{ width: `${Math.max(muted ? 0 : 6, bar)}%` }}
                  />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {displaySourceLabel(p.source)}{" "}
                        <span className="font-normal text-muted-foreground">→</span>{" "}
                        <span className="font-medium">{p.page || "/"}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{ratePct}%</span> meeting rate ·{" "}
                        {p.conversations.toLocaleString()} conv · {p.sessions.toLocaleString()} sessions
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
            })}
          </div>
        )}
      </CardShell>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Path detail</SheetTitle>
            <SheetDescription>
              {selected
                ? `${displaySourceLabel(selected.source)} → ${selected.page}`
                : "Conversation links for this acquisition path"}
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
                    No conversation ids on events for this path yet. Open Inbox to find related threads.
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
