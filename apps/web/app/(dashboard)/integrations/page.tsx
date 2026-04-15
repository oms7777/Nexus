"use client";

import { Protect, useOrganization } from "@clerk/nextjs";

import { IntegrationsView } from "@/modules/integrations/ui/views/integrations-view";
import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";

const Page = () => {
  const ent = useEntitlements();
  const { isLoaded, membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";

  if (ent.isLoading) return null;
  if (!isLoaded) return null;
  if (!isAdmin) return <Protect>{null}</Protect>;

  return (
    <Protect>
      <IntegrationsView />
    </Protect>
  );
};

export default Page;
