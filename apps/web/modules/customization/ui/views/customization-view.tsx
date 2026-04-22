"use client";

import { api } from "@workspace/backend/_generated/api";
import { useQuery } from "convex/react";
import { Loader2Icon, MessageCircle, Sparkles, Target, ShieldCheck, ListTree } from "lucide-react";
import { CustomizationForm } from "../components/customization-form";

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

  return (
    <div className="min-h-screen bg-muted px-4 py-8 md:px-8">
      <div className="w-full space-y-8">
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
              <span>Branding</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
              <MessageCircle className="h-4 w-4 text-indigo-500" />
              <span>General chat</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
              <ListTree className="h-4 w-4 text-amber-600" />
              <span>Playbook</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
              <Target className="h-4 w-4 text-violet-500" />
              <span>Page-based Promos</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Consent &amp; Privacy</span>
            </div>
          </div>
        </header>

        {/* Main content: juste le form avec onglets plein écran */}
        <main>
          <CustomizationForm initialData={widgetSettings} />
        </main>
      </div>
    </div>
  );
};
