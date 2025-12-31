"use client";


import { OrganizationProfile, Protect, useOrganization } from "@clerk/nextjs";

export default function Page() {
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";

  return (
    <Protect
    >
      <div className="p-6">
        <OrganizationProfile
          routing="hash"
          appearance={{
            elements: {
              organizationProfileDangerSection: "hidden",
              organizationProfileLeaveOrganization: "hidden",
              organizationProfileDeleteOrganization: "hidden",
              organizationProfileLeaveOrganizationAction: "hidden",
              organizationProfileDeleteOrganizationAction: "hidden",
            },
          }}
        />
      </div>
    </Protect>
  );
}
