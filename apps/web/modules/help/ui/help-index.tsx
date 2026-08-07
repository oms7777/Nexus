"use client";

import Link from "next/link";
import { ArrowRight, CircleHelp } from "lucide-react";

import { helpArticlesByCategory } from "../articles";

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
          Short guides for install, booking, CRM, and analytics. For plan details and pricing, use the
          public site — this hub is for operators inside the product.
        </p>
      </header>

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
