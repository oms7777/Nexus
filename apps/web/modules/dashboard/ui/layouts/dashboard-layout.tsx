// apps/web/modules/dashboard/ui/layouts/dashboard-layout.tsx
"use client";

import React from "react";
import { AuthGuard } from "@/modules/auth/ui/components/auth-guard";
import { OrganizationGuard } from "@/modules/auth/ui/components/organization-guard";
import { SidebarProvider } from "@workspace/ui/components/sidebar";
import { DashboardSidebar } from "../components/dashboard-sidebar";
import { Provider } from "jotai";
import { RepsAvailabilityBar } from "@/modules/dashboard/ui/components/reps-availability-bar";

export const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <AuthGuard>
      <OrganizationGuard>
        <Provider>
          <SidebarProvider defaultOpen>
            <DashboardSidebar />

            {/* Shell full width */}
            <div className="flex min-h-screen flex-1 flex-col bg-background">
              {/* Top bar full width */}
              <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
                <div className="flex h-14 w-full items-center justify-between px-4 md:px-6">

                  {/* Right: reps + ME */}
                  <RepsAvailabilityBar />
                </div>
              </header>

              {/* Main content: full width */}
              <main className="flex-1 w-full px-4 py-6 md:px-6">
                {children}
              </main>
            </div>
          </SidebarProvider>
        </Provider>
      </OrganizationGuard>
    </AuthGuard>
  );
};
