// app/(dashboard)/plugins/vapi/page.tsx
"use client";

import { Protect } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { VapiView } from "@/modules/plugins/ui/views/vapi-view";
import { useEntitlements } from "@/modules/billing/hooks/use-entitlements";

const Page = () => {
  const ent = useEntitlements();
  const router = useRouter();

  useEffect(() => {
    if (ent.isLoading) return;

    if (!ent.isActive || !ent.features.canUseVoice) {
      router.replace("/");
    }
  }, [ent.isLoading, ent.isActive, ent.features.canUseVoice, router]);

  if (ent.isLoading) return null;
  if (!ent.isActive || !ent.features.canUseVoice) return null;

  return (
    <Protect>
      <VapiView />
    </Protect>
  );
};

export default Page;
