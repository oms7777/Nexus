"use client";

import { OrganizationProfile } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="p-6">
      <OrganizationProfile
        routing="hash"
        appearance={{
          elements: {
            // ⚠️ selon les versions, Clerk utilise ces keys (une partie suffit, le reste est ignoré)
            organizationProfileDangerSection: "hidden",
            organizationProfileLeaveOrganization: "hidden",
            organizationProfileDeleteOrganization: "hidden",
            organizationProfileLeaveOrganizationAction: "hidden",
            organizationProfileDeleteOrganizationAction: "hidden",
          },
        }}
      />
    </div>
  );
}
