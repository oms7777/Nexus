"use client";

import { OrganizationProfile } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="p-6">
      <OrganizationProfile routing="hash" />
    </div>
  );
}
