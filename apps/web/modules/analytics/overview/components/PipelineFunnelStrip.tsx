"use client";

import { useState } from "react";

type Step = {
  key: string;
  label: string;
  value: number;
};

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
    { key: "sessions", label: "Sessions", value: sessions },
    { key: "experiences", label: "Experience", value: experiences },
    { key: "inbound", label: "Inbound", value: inboundRequests },
    { key: "conversations", label: "Conversations", value: conversations },
    { key: "meetings", label: "Meetings", value: meetings },
  ];

  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...steps.map((s) => s.value));

  return (
    <div className="rounded-2xl border border-border/70 bg-gradient-to-b from-white to-fuchsia-50/30 p-5 shadow-sm dark:from-card dark:to-fuchsia-950/10">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Pipeline flow</h2>
          <p className="text-xs text-muted-foreground">Volume by stage — hover a step for drop-off</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
        {steps.map((step, i) => {
          const prev = i > 0 ? steps[i - 1]!.value : null;
          const drop =
            prev != null && prev > 0 ? Math.max(0, 1 - step.value / prev) : null;
          const active = hover === i;
          const dim = hover != null && hover !== i && hover !== i - 1;

          return (
            <div key={step.key} className="flex min-w-0 flex-1 items-stretch sm:flex-row">
              {i > 0 ? (
                <div className="hidden w-6 shrink-0 items-center justify-center sm:flex">
                  <div
                    className={[
                      "h-px w-full transition",
                      active || hover === i - 1 ? "bg-fuchsia-400" : "bg-border",
                    ].join(" ")}
                  />
                </div>
              ) : null}
              <button
                type="button"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className={[
                  "group relative flex w-full flex-col rounded-xl border px-3 py-3 text-left transition",
                  active
                    ? "border-fuchsia-300 bg-white shadow-md ring-1 ring-fuchsia-200/80 dark:bg-card"
                    : "border-border/60 bg-white/80 hover:border-fuchsia-200 dark:bg-card/80",
                  dim ? "opacity-45" : "opacity-100",
                ].join(" ")}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {step.label}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {step.value.toLocaleString()}
                </div>
                {drop != null ? (
                  <div
                    className={[
                      "mt-1 text-[11px] font-medium tabular-nums",
                      drop >= 0.7 ? "text-rose-600" : "text-muted-foreground",
                      active ? "opacity-100" : "opacity-80",
                    ].join(" ")}
                  >
                    −{(drop * 100).toFixed(0)}% from prior
                  </div>
                ) : (
                  <div className="mt-1 text-[11px] text-muted-foreground">Top of funnel</div>
                )}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/80">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-400 transition-all"
                    style={{ width: `${Math.max(4, (step.value / max) * 100)}%` }}
                  />
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
