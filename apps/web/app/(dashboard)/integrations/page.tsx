"use client";

import { Protect } from "@clerk/nextjs";

import { IntegrationsView } from "@/modules/integrations/ui/views/integrations-view";
import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";

const Page = () => {
  const ent = useEntitlements();

  if (ent.isLoading) return null;

  return (
    <Protect>
      <IntegrationsView />
    </Protect>
  );
};

export default Page;
