"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@workspace/ui/components/button";

import type { HelpArticle } from "../articles";
import { SUPPORT_EMAIL, SUPPORT_HOURS_LABEL } from "../support";

export function HelpArticleView({ article }: { article: HelpArticle }) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-6 py-10 md:px-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
          <Link href="/help">
            <ArrowLeft className="size-3.5" aria-hidden />
            All help
          </Link>
        </Button>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {article.category}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{article.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{article.summary}</p>
      </div>

      {article.hrefs?.length ? (
        <div className="flex flex-wrap gap-2">
          {article.hrefs.map((h) => (
            <Button key={h.href} asChild size="sm" variant="outline">
              <Link href={h.href}>
                {h.label}
                <ExternalLink className="size-3.5 opacity-70" aria-hidden />
              </Link>
            </Button>
          ))}
        </div>
      ) : null}

      <ol className="space-y-3 rounded-xl border bg-card p-5">
        {article.steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-foreground">
              {i + 1}
            </span>
            <span className="pt-0.5 text-foreground/90">{step}</span>
          </li>
        ))}
      </ol>

      {article.tips?.length ? (
        <div className="space-y-2 rounded-xl border border-amber-200/70 bg-amber-50/60 p-4 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Tips</div>
          <ul className="list-disc space-y-1.5 pl-4">
            {article.tips.map((t, i) => (
              <li key={i} className="leading-relaxed">
                {t}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t pt-4 text-xs text-muted-foreground">
        Still stuck? Email{" "}
        <a
          className="font-medium text-foreground underline-offset-2 hover:underline"
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(article.title)}`}
        >
          {SUPPORT_EMAIL}
        </a>{" "}
        · {SUPPORT_HOURS_LABEL}. Include your organization id from Integrations.
      </p>
    </div>
  );
}
