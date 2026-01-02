// apps/web/modules/dashboard/ui/layouts/dashboard-layout.tsx
"use client";

import React from "react";
import { AuthGuard } from "@/modules/auth/ui/components/auth-guard";
import { OrganizationGuard } from "@/modules/auth/ui/components/organization-guard";
import { SidebarProvider } from "@workspace/ui/components/sidebar";
import { DashboardSidebar } from "../components/dashboard-sidebar";
import { Provider } from "jotai";
import { useOrganization } from "@clerk/nextjs";
import { RepsAvailabilityBar } from "../components/reps-availability-bar";

function DashboardHeader() {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  return (
    <header className="flex items-center justify-between border-b bg-background px-4 py-2">
      <div className="text-sm font-medium">Dashboard</div>

      {orgId ? (
        <RepsAvailabilityBar organizationId={orgId} />
      ) : (
        <div className="text-xs text-muted-foreground">No organization</div>
      )}
    </header>
  );
}

export const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <AuthGuard>
      <OrganizationGuard>
        <Provider>
          <SidebarProvider defaultOpen>
            <DashboardSidebar />
            <main className="flex flex-1 flex-col">
              <DashboardHeader />
              <div className="flex-1">{children}</div>
            </main>
          </SidebarProvider>
        </Provider>
      </OrganizationGuard>
    </AuthGuard>
  );
};
