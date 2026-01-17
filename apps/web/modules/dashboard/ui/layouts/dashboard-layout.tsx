// apps/web/modules/dashboard/ui/layouts/dashboard-layout.tsx
"use client";

import React, { useEffect } from "react";
import { AuthGuard } from "@/modules/auth/ui/components/auth-guard";
import { OrganizationGuard } from "@/modules/auth/ui/components/organization-guard";
import { SidebarProvider } from "@workspace/ui/components/sidebar";
import { DashboardSidebar } from "../components/dashboard-sidebar";
import { Provider } from "jotai";
import { RepsAvailabilityBar } from "@/modules/dashboard/ui/components/reps-availability-bar";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization } from "@clerk/nextjs";

export const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  const ensurePresence = useMutation(api.team.ensureRepPresenceForMe);
  const { organization, isLoaded } = useOrganization();

  const orgId = organization?.id;

  useEffect(() => {
    if (!isLoaded || !orgId) return;

    // présence du rep dès connexion (une fois org chargé)
    ensurePresence({ role: "sales", available: true }).catch(() => {});
  }, [ensurePresence, isLoaded, orgId]);

  return (
    <AuthGuard>
      <OrganizationGuard>
        <Provider>
          <SidebarProvider defaultOpen>
            <DashboardSidebar />
            <div className="flex min-h-screen flex-1 flex-col bg-background">
              <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
                <div className="flex h-14 w-full items-center justify-between px-4 md:px-6">
                  {isLoaded && orgId ? <RepsAvailabilityBar organizationId={orgId} /> : null}
                </div>
              </header>

              <main className="flex-1 w-full px-4 py-6 md:px-6">{children}</main>
            </div>
          </SidebarProvider>
        </Provider>
      </OrganizationGuard>
    </AuthGuard>
  );
};
