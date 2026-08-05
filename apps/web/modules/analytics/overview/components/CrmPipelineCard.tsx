"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { BrandPill, CardShell } from "@/modules/analytics/shared/analytics-primitives";
import { Button } from "@workspace/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";

function fmtMoney(amount: number, currency?: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: currency ? "currency" : "decimal",
      currency: currency || undefined,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString()}${currency ? ` ${currency}` : ""}`;
  }
}

function fmtPct(n: number, d: number) {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

export function CrmPipelineCard({
  fromTs,
  toTs,
  showPlanBadge,
}: {
  fromTs: number;
  toTs: number;
  showPlanBadge?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const summary = useQuery(api.private.attribution.getRevenueSummary, { fromTs, toTs });
  const meetings = useQuery(
    api.private.attribution.getAttributedMeetings,
    open ? { fromTs, toTs, limit: 40 } : "skip",
  );

  if (summary === undefined) {
    return (
      <CardShell title="CRM pipeline" subtitle="Attributed deal value from HubSpot / Salesforce">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </CardShell>
    );
  }

  if (!summary.entitled) {
    return null;
  }

  if (!summary.crmConnected) {
    return (
      <CardShell
        title="CRM pipeline"
        subtitle="Connect HubSpot or Salesforce to attribute deal € and stages to meetings"
        right={showPlanBadge ? <BrandPill>Growth · CRM</BrandPill> : null}
      >
        <p className="text-sm text-muted-foreground">
          Meetings already sync contacts/leads when CRM is connected. Deals and stages appear here
          automatically.
        </p>
        <Button asChild className="mt-4 bg-fuchsia-600 hover:bg-fuchsia-700" size="sm">
          <Link href="/integrations">Connect CRM</Link>
        </Button>
      </CardShell>
    );
  }

  const providers = summary.providers.map((p) => (p === "hubspot" ? "HubSpot" : "Salesforce")).join(" · ");
  const meetToDeal = fmtPct(summary.dealCount, summary.meetings);
  const stages = summary.stages ?? [];

  return (
    <>
      <CardShell
        title="CRM pipeline"
        subtitle={`Attributed from ${providers} · same period as Overview`}
        right={
          <div className="flex items-center gap-2">
            {showPlanBadge ? <BrandPill>Growth · CRM</BrandPill> : null}
            {summary.dealCount > 0 ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-xs font-medium text-fuchsia-700 hover:underline dark:text-fuchsia-300"
              >
                View deals
              </button>
            ) : null}
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="Open pipeline"
            value={fmtMoney(summary.openPipelineAmount, summary.currency)}
          />
          <Stat label="Closed won" value={fmtMoney(summary.wonAmount, summary.currency)} />
          <Stat label="Deals linked" value={summary.dealCount.toLocaleString()} />
          <Stat label="Meetings → deal" value={meetToDeal} hint={`${summary.dealCount}/${summary.meetings}`} />
        </div>

        {summary.dealCount === 0 ? (
          <p className="mt-4 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            {summary.meetingsWithCrmLink > 0
              ? `${summary.meetingsWithCrmLink} meeting(s) linked to a CRM contact/lead — no deal matched yet. Deals sync daily once created in the CRM.`
              : "No CRM-linked meetings in this period yet. Bookings create a HubSpot contact or Salesforce lead when CRM is connected."}
          </p>
        ) : null}

        {stages.length > 0 ? (
          <div className="mt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              By stage
            </div>
            <ul className="space-y-1.5">
              {stages.map((s) => (
                <li
                  key={s.stage}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate font-medium">{s.stage}</span>
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {s.count} · {fmtMoney(s.amount, summary.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardShell>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Attributed meetings</SheetTitle>
            <SheetDescription>
              Meetings with a matched CRM deal for this period (amount & stage from CRM).
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {meetings === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : meetings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attributed deals yet.</p>
            ) : (
              meetings.map((m) => (
                <div
                  key={m.bookingId}
                  className="rounded-xl border border-border/70 bg-card px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {m.company || m.attendeeName || m.attendeeEmail || "Meeting"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.attendeeEmail}
                        {m.stage ? ` · ${m.stage}` : ""}
                        {m.isWon ? " · Won" : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold tabular-nums">
                      {m.amount != null ? fmtMoney(m.amount, m.currency ?? summary.currency) : "—"}
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {m.provider === "hubspot" ? "HubSpot" : "Salesforce"}
                    {m.closeDate ? ` · close ${m.closeDate}` : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Growth/Enterprise without CRM add-on — soft upsell, never fake €. */
export function CrmPipelineGrowthTeaser({ showPlanBadge }: { showPlanBadge?: boolean }) {
  return (
    <CardShell
      title="CRM pipeline"
      subtitle="Attribute deal value and stages to meetings — Growth CRM add-on"
      right={showPlanBadge ? <BrandPill>Growth</BrandPill> : null}
    >
      <p className="text-sm text-muted-foreground">
        Connect HubSpot or Salesforce on Growth to see open pipeline €, closed won, and deal stages
        next to your meetings. Not available on Starter.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link href="/integrations">See CRM integrations</Link>
      </Button>
    </CardShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/25 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">{value}</div>
      {hint ? <div className="text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
