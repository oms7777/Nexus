"use client";

import { Protect } from "@clerk/nextjs";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { IntegrationsView } from "@/modules/integrations/ui/views/integrations-view";
import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";

const Page = () => {
  const ent = useEntitlements();
  const router = useRouter();

  // Widget embed + org ID: all paid/trial orgs (incl. Starter). Slack/Salesforce stay plan-gated inside the view.
  const canAccessIntegrationsPage = ent.isActive;

  useEffect(() => {
    if (ent.isLoading) return;

    if (!canAccessIntegrationsPage) {
      router.replace("/");
    }
  }, [ent.isLoading, canAccessIntegrationsPage, router]);

  if (ent.isLoading) return null;
  if (!canAccessIntegrationsPage) return null;

  return (
    <Protect>
      <IntegrationsView />
    </Protect>
  );
};

export default Page;
