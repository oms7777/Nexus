"use client";

import { Protect, useOrganization } from "@clerk/nextjs";

import { PrivacyView } from "@/modules/dashboard/ui/views/privacy-view";

export default function Page() {
  const { isLoaded, membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";

  if (!isLoaded) return null;
  if (!isAdmin) return <Protect>{null}</Protect>;

  return (
    <Protect>
      <PrivacyView />
    </Protect>
  );
}
