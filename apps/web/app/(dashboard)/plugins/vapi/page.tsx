// Legacy URL — Voice lives under Integrations now.
"use client";

import { Protect } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";

const Page = () => {
  const ent = useEntitlements();
  const router = useRouter();

  useEffect(() => {
    if (ent.isLoading) return;

    if (!ent.isActive || !ent.features.canUseVoice) {
      router.replace("/");
      return;
    }

    router.replace("/integrations#voice");
  }, [ent.isLoading, ent.isActive, ent.features.canUseVoice, router]);

  if (ent.isLoading) return null;
  if (!ent.isActive || !ent.features.canUseVoice) return null;

  return (
    <Protect>
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Redirecting to Integrations…
      </div>
    </Protect>
  );
};

export default Page;
