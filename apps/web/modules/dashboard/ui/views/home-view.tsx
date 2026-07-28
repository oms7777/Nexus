"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Circle,
  Globe,
  MessageSquare,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";

type StepId = "domain" | "widget" | "knowledge" | "team" | "calendar" | "firstConversation";

const STEP_COPY: Record<
  StepId,
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

function formatMoney(amount: number, currency?: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: currency ? "currency" : "decimal",
      currency: currency || undefined,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return Math.round(amount).toLocaleString();
  }
}

/**
 * The ROI line: meetings only justify the subscription once they can be tied to
 * pipeline in the customer's own CRM.
 */
function RevenueCard() {
  const revenue = useQuery(api.private.attribution.getRevenueSummary, {});

  if (revenue === undefined) return <Skeleton className="h-28" />;
  if (!revenue.crmConnected) return null;

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Pipeline attributed to Inboundless</h2>
        <span className="text-xs text-muted-foreground">Last 90 days</span>
      </div>

      {revenue.dealCount === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {revenue.meetings === 0
            ? "No meetings booked yet. Once visitors book, deals created in your CRM show up here."
            : `${revenue.meetings} meeting(s) booked. None has produced a CRM deal yet — this updates twice a day.`}
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground">Pipeline created</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {formatMoney(revenue.pipelineAmount, revenue.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Closed won</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatMoney(revenue.wonAmount, revenue.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Deals</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {revenue.dealCount}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  ({revenue.wonCount} won)
                </span>
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            From {revenue.meetings} meeting(s) booked through the widget, matched against your CRM.
          </p>
        </>
      )}
    </section>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Globe;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border bg-card p-4 transition hover:border-fuchsia-300/80 hover:shadow-sm dark:hover:border-fuchsia-700/50"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
    </Link>
  );
}

export function HomeView() {
  const data = useQuery(api.private.onboarding.getStatus, {});

  if (data === undefined) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton className="h-24" key={i} />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const remaining = data.steps.filter((s) => s.applicable && !s.done);
  const progressPct = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {data.isComplete ? "Your inbound pipeline" : "Finish setting up Inboundless"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {data.isComplete
            ? "Everything is connected. Here is what happened over the last 7 days."
            : `${data.completed} of ${data.total} steps done — complete these to start capturing leads.`}
        </p>
      </header>

      {data.status === "paused" ? (
        <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
          This workspace is paused, so the assistant will not reply to visitors. Contact us to
          reactivate it.
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Globe} label="Sessions (7d)" value={data.last7Days.sessions} href="/live" />
        <StatCard
          icon={MessageSquare}
          label="Conversations (7d)"
          value={data.last7Days.conversations}
          href="/conversations"
        />
        <StatCard
          icon={Users}
          label="Inbound requests (7d)"
          value={data.last7Days.inboundRequests}
          href="/analytics/funnel"
        />
        <StatCard
          icon={CalendarCheck}
          label="Meetings booked (7d)"
          value={data.last7Days.meetings}
          href="/analytics/overview"
        />
      </section>

      <RevenueCard />

      <section className="rounded-xl border bg-card">
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
          {data.steps
            .filter((step) => step.applicable)
            .map((step) => {
              const copy = STEP_COPY[step.id as StepId];
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
            Setup complete. This list stays here as a health check — a step turning back to open
            means something got disconnected.
          </div>
        ) : null}
      </section>
    </div>
  );
}
