// apps/web/modules/customization/ui/views/customization-view.tsx
"use client";

import { api } from "@workspace/backend/_generated/api";
import { useQuery } from "convex/react";
import { Loader2Icon } from "lucide-react";
import { CustomizationForm } from "../components/customization-form";
import PromosPanel from "../components/promos-panel";
import { useHasPro } from "@/lib/useHasPro";
import { PremiumFeatureOverlay } from "@/modules/billing/ui/components/premium-feature-overlay";

export const CustomizationView = () => {
  const widgetSettings = useQuery(api.private.widgetSettings.getOne);
  const vapiPlugin = useQuery(api.private.plugins.getOne, { service: "vapi" });
  const { isPro, loading: loadingPro } = useHasPro();

  const isLoading = widgetSettings === undefined || vapiPlugin === undefined || loadingPro;

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-y-2 bg-muted p-8">
        <Loader2Icon className="text-muted-foreground animate-spin" />
        <p className="text-muted-foreground text-sm">Loading Settings...</p>
      </div>
    );
  }


  // ✅ Pro → UI complète
  return (
    <div className="flex min-h-screen flex-col bg-muted p-8">
      <div className="mx-auto w-full max-w-screen-md space-y-12">
        <section>
          <div className="space-y-2">
            <h1 className="text-2xl md:text-4xl">Widget Customization</h1>
            <p className="text-muted-foreground">
              Customize how your chat widget looks and behaves for your customers
            </p>
          </div>
          <div className="mt-8">
            <CustomizationForm initialData={widgetSettings} hasVapiPlugin={!!vapiPlugin} />
          </div>
        </section>

        <section>
          <PromosPanel />
        </section>
      </div>
    </div>
  );
};
