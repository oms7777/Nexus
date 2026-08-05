"use client";

type Step = {
  key: string;
  label: string;
  hint: string;
  value: number;
};

/**
 * Classic funnel bars (wide → narrow) — not a row of slide cards.
 */
export function PipelineFunnelStrip({
  sessions,
  experiences,
  inboundRequests,
  conversations,
  meetings,
}: {
  sessions: number;
  experiences: number;
  inboundRequests: number;
  conversations: number;
  meetings: number;
}) {
  const steps: Step[] = [
    {
      key: "sessions",
      label: "Sessions",
      hint: "Unique visitors who hit a page with the widget",
      value: sessions,
    },
    {
      key: "experiences",
      label: "Widget shown",
      hint: "Times the chat experience was actually shown",
      value: experiences,
    },
    {
      key: "inbound",
      label: "Chat requested",
      hint: "Visitor asked to talk to sales (inbound handoff)",
      value: inboundRequests,
    },
    {
      key: "conversations",
      label: "Conversations",
      hint: "Chat threads created",
      value: conversations,
    },
    {
      key: "meetings",
      label: "Meetings",
      hint: "Meetings booked in Inboundless",
      value: meetings,
    },
  ];

  const max = Math.max(1, ...steps.map((s) => s.value));

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">Conversion funnel</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          How traffic becomes a booked meeting — bar width = relative volume
        </p>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col items-center gap-1.5">
        {steps.map((step, i) => {
          const prev = i > 0 ? steps[i - 1]!.value : null;
          const keep =
            prev != null && prev > 0 ? Math.round((step.value / prev) * 1000) / 10 : null;
          // Funnel shape: top ~100%, bottom narrower but never tiny for readability
          const widthPct = 42 + (step.value / max) * 58;

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
                    {keep}% kept
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
                    "flex items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-white shadow-sm",
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
