"use client";

import Link from "next/link";
import { ArrowRight, CircleHelp, Clock, Mail } from "lucide-react";
import { Button } from "@workspace/ui/components/button";

import { helpArticlesByCategory } from "../articles";
import { SUPPORT_EMAIL, SUPPORT_HOURS_LABEL } from "../support";

export function HelpIndex() {
  const groups = helpArticlesByCategory();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-10 md:px-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CircleHelp className="size-5" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide">Help</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Get live and stay healthy</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Short guides for install, booking, CRM, and analytics — plus how to reach support during
          business hours.
        </p>
      </header>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h2 className="text-base font-semibold tracking-tight">Contact support</h2>
            <p className="text-sm text-muted-foreground">
              Human support during business hours (Europe). Include your organization id from
              Integrations → Technical details when you write in.
            </p>
            <div className="flex flex-col gap-1.5 text-sm text-foreground/90">
              <div className="flex items-center gap-2">
                <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{SUPPORT_HOURS_LABEL}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <a
                  className="font-medium underline-offset-2 hover:underline"
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Inboundless support")}`}
                >
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Outside these hours we reply on the next business day. Critical outages: still email —
              we triage by severity.
            </p>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Inboundless support")}`}>
              Email support
            </a>
          </Button>
        </div>
      </section>

      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.category} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {g.category}
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {g.articles.map((a) => (
                <li key={a.slug}>
                  <Link
                    href={`/help/${a.slug}`}
                    className="flex items-start gap-3 px-5 py-4 transition hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">{a.title}</div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{a.summary}</p>
                    </div>
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
