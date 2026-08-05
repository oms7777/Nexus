"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Sparkles,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

export type SetupStepId =
  | "domain"
  | "widget"
  | "knowledge"
  | "team"
  | "calendar"
  | "firstConversation";

export type SetupStep = {
  id: SetupStepId | string;
  done: boolean;
  applicable: boolean;
};

const STEP_COPY: Record<
  SetupStepId,
  { title: string; description: string; href: string; cta: string }
> = {
  domain: {
    title: "Allow your website domain",
    description: "The widget only loads on domains you explicitly allow.",
    href: "/integrations",
    cta: "Add domain",
  },
  widget: {
    title: "Install the widget snippet",
    description: "Paste one script tag before the closing body tag of your site.",
    href: "/integrations",
    cta: "Get the snippet",
  },
  knowledge: {
    title: "Teach the assistant about your business",
    description: "Index your website or upload documents so answers stay accurate.",
    href: "/files",
    cta: "Index content",
  },
  team: {
    title: "Put a rep online",
    description: "At least one teammate must receive leads for routing to work.",
    href: "/team",
    cta: "Open team",
  },
  calendar: {
    title: "Connect a calendar",
    description: "Visitors can only book meetings once a rep connects Google or Microsoft.",
    href: "/me/calendar",
    cta: "Connect calendar",
  },
  firstConversation: {
    title: "Run a test conversation",
    description: "Open the widget on your own site and send a message end to end.",
    href: "/conversations",
    cta: "Open inbox",
  },
};

export function SetupChecklist({
  steps,
  completed,
  total,
  compact = false,
}: {
  steps: SetupStep[];
  completed: number;
  total: number;
  compact?: boolean;
}) {
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const remaining = steps.filter((s) => s.applicable && !s.done);

  return (
    <div className={cn("rounded-xl border bg-card", compact && "border-0 shadow-none")}>
      <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-fuchsia-500" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">Setup checklist</h2>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Setup progress"
          >
            <div
              className="h-full rounded-full bg-fuchsia-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {progressPct}%
          </span>
        </div>
      </div>

      <ul className="divide-y">
        {steps
          .filter((step) => step.applicable)
          .map((step) => {
            const copy = STEP_COPY[step.id as SetupStepId];
            if (!copy) return null;
            return (
              <li className="flex items-start gap-3 px-5 py-4" key={step.id}>
                {step.done ? (
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-emerald-500"
                    aria-hidden
                  />
                ) : (
                  <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground/50" aria-hidden />
                )}

                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-sm font-medium",
                      step.done ? "text-muted-foreground line-through" : "text-foreground",
                    )}
                  >
                    {copy.title}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{copy.description}</p>
                </div>

                {step.done ? null : (
                  <Button asChild size="sm" variant="outline">
                    <Link href={copy.href}>
                      {copy.cta}
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </Button>
                )}
              </li>
            );
          })}
      </ul>

      {remaining.length === 0 ? (
        <div className="border-t px-5 py-4 text-xs text-muted-foreground">
          Setup complete. If a step opens again later, something got disconnected.
        </div>
      ) : null}
    </div>
  );
}
