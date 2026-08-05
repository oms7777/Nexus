"use client";

type Step = {
  key: string;
  label: string;
  hint: string;
  value: number;
};

/**
 * Executive funnel — 3 stages only. Widget shown / chat requested live on Funnel
 * diagnostics; here a HoS needs Session → Conversation → Meeting.
 */
export function PipelineFunnelStrip({
  sessions,
  conversations,
  meetings,
}: {
  sessions: number;
  conversations: number;
  meetings: number;
  /** Kept for call-site compat; ignored on Overview. */
  experiences?: number;
  inboundRequests?: number;
}) {
  const steps: Step[] = [
    {
      key: "sessions",
      label: "Sessions",
      hint: "Visitors on pages with the widget",
      value: sessions,
    },
    {
      key: "conversations",
      label: "Conversations",
      hint: "Chat threads started",
      value: conversations,
    },
    {
      key: "meetings",
      label: "Meetings",
      hint: "Booked in Inboundless",
      value: meetings,
    },
  ];

  const max = Math.max(1, ...steps.map((s) => s.value));

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">Conversion funnel</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Traffic → chat → booked meeting. Finer steps are on the Funnel tab.
        </p>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col items-center gap-1.5">
        {steps.map((step, i) => {
          const prev = i > 0 ? steps[i - 1]!.value : null;
          const keep =
            prev != null && prev > 0 ? Math.round((step.value / prev) * 1000) / 10 : null;
          const widthPct = 48 + (step.value / max) * 52;

          return (
            <div key={step.key} className="w-full">
              {i > 0 && keep != null ? (
                <div className="mb-1 flex justify-center">
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                      keep < 30
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200"
                        : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    {keep}% converted
                  </span>
                </div>
              ) : null}

              <div
                className="mx-auto transition-[width] duration-500"
                style={{ width: `${widthPct}%` }}
                title={step.hint}
              >
                <div
                  className={[
                    "flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-white shadow-sm",
                    i === steps.length - 1
                      ? "bg-gradient-to-r from-rose-500 to-fuchsia-600"
                      : "bg-gradient-to-r from-fuchsia-600/90 to-fuchsia-500/85",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold uppercase tracking-wide text-white/85">
                      {step.label}
                    </div>
                    <div className="truncate text-[10px] text-white/65">{step.hint}</div>
                  </div>
                  <div className="shrink-0 text-2xl font-bold tabular-nums tracking-tight">
                    {step.value.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
