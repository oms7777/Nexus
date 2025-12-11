// apps/web/modules/customization/ui/views/customization-view.tsx
"use client";

import { api } from "@workspace/backend/_generated/api";
import { useQuery } from "convex/react";
import { Loader2Icon, Sparkles, Target, ShieldCheck } from "lucide-react";
import { CustomizationForm } from "../components/customization-form";
import PromosPanel from "../components/promos-panel";

export const CustomizationView = () => {
  const widgetSettings = useQuery(api.private.widgetSettings.getOne);

  const isLoading = widgetSettings === undefined;

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-y-2 bg-muted">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Loading widget settings…
        </p>
      </div>
    );
  }

  const theme = widgetSettings?.theme ?? null;
  const brandLogoUrl = widgetSettings?.brandLogoUrl ?? null;

  return (
    <div className="min-h-screen bg-muted px-4 py-8 md:px-8">
      <div className="w-full space-y-8 xl:pr-10">
        {/* Page header */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold md:text-3xl">
              Widget Customization
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
              Design how your assistant shows up on your website: colors, copy,
              consent, and contextual promos tailored to each page.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs md:text-sm">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
              <Sparkles className="h-4 w-4 text-sky-500" />
              <span>Branding & Chat</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Consent & Privacy</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
              <Target className="h-4 w-4 text-violet-500" />
              <span>Page-based Promos</span>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
          {/* LEFT: global settings (branding, chat, consent) */}
          <section className="space-y-6">
            <CustomizationForm initialData={widgetSettings} />
          </section>

          {/* RIGHT: promos & helper */}
          <aside className="space-y-4">
            <PromosPanel theme={theme} brandLogoUrl={brandLogoUrl} />

            <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
              <h2 className="mb-1 text-sm font-medium text-foreground">
                How promos work
              </h2>
              <p className="mb-2">
                Promos are smart nudges shown above the chat bubble based on the
                current page and UTM parameters.
              </p>
              <ul className="space-y-1 text-xs">
                <li>
                  • <span className="font-medium">Path prefix</span> – e.g.{" "}
                  <code className="rounded bg-muted px-1">/pricing</code> to
                  target your pricing page.
                </li>
                <li>
                  • <span className="font-medium">URL includes</span> – comma
                  list like{" "}
                  <code className="rounded bg-muted px-1">
                    observability,kubernetes
                  </code>
                  .
                </li>
                <li>
                  • <span className="font-medium">UTM source</span> – e.g.{" "}
                  <code className="rounded bg-muted px-1">
                    ads,newsletter
                  </code>{" "}
                  to customize promos per campaign.
                </li>
              </ul>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};
