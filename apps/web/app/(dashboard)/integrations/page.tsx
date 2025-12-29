"use client";

import { Protect } from "@clerk/nextjs";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { IntegrationsView } from "@/modules/integrations/ui/views/integrations-view";
import { useEntitlements } from "@/modules/billing/hooks/use-entitlements";

const Page = () => {
  const ent = useEntitlements();
  const router = useRouter();

  const canSeeIntegrations = ent.features.canUseSlack || ent.features.canUseSalesforce;

  useEffect(() => {
    if (ent.isLoading) return;

    // ✅ gating silencieux
    if (!ent.isActive || !canSeeIntegrations) {
      router.replace("/");
    }
  }, [ent.isLoading, ent.isActive, canSeeIntegrations, router]);

  if (ent.isLoading) return null;
  if (!ent.isActive || !canSeeIntegrations) return null;

  return (
    <Protect>
      <IntegrationsView />
    </Protect>
  );
};

export default Page;
