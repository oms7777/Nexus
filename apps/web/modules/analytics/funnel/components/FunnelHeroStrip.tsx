"use client";

/**
 * Compact headline metrics above the funnel grid — mirrors Overview “primary outcome” energy.
 */
export function FunnelHeroStrip({
  meetings,
  conversations,
  sessions,
}: {
  meetings: number;
  conversations: number;
  sessions: number;
}) {
  const convToMtg = conversations > 0 ? (meetings / conversations) * 100 : 0;
  const sessToMtg = sessions > 0 ? (meetings / sessions) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-fuchsia-200/50 bg-gradient-to-br from-fuchsia-50/90 via-white to-rose-50/50 p-5 shadow-sm ring-1 ring-black/[0.04] dark:border-fuchsia-900/35 dark:from-fuchsia-950/30 dark:via-background dark:to-rose-950/15 dark:ring-white/10">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-800/85 dark:text-fuchsia-300/90">
        Funnel snapshot
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/90 bg-white/95 px-3 py-2.5 shadow-sm dark:border-border dark:bg-card/90">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Meetings</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums">{meetings.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-white/90 bg-white/95 px-3 py-2.5 shadow-sm dark:border-border dark:bg-card/90">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Conv. → meeting</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums">{convToMtg.toFixed(1)}%</div>
        </div>
        <div className="rounded-xl border border-white/90 bg-white/95 px-3 py-2.5 shadow-sm dark:border-border dark:bg-card/90">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Session → meeting</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums">{sessToMtg.toFixed(2)}%</div>
        </div>
        <div className="rounded-xl border border-white/90 bg-white/95 px-3 py-2.5 shadow-sm dark:border-border dark:bg-card/90">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Conversations</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums">{conversations.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
