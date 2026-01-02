// (ex) apps/web/modules/dashboard/ui/layouts/dashboard-layout.tsx
import { AuthGuard } from "@/modules/auth/ui/components/auth-guard";
import { OrganizationGuard } from "@/modules/auth/ui/components/organization-guard";
import { SidebarProvider } from "@workspace/ui/components/sidebar";
import { cookies } from "next/headers";
import { DashboardSidebar } from "../components/dashboard-sidebar";
import { Provider } from "jotai";
import { RepsAvailabilityBar } from "../components/reps-availability-bar";

export const DashboardLayout = async ({ children }: { children: React.ReactNode }) => {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";

  // ✅ Si tu as orgId en cookie ou header, récupère-le ici.
  // Sinon, laisse vide et passe-le via OrganizationGuard (recommended).
  const organizationId = cookieStore.get("org_id")?.value;

  return (
    <AuthGuard>
      <OrganizationGuard>
        <Provider>
          <SidebarProvider defaultOpen={defaultOpen}>
            <DashboardSidebar />
            <main className="flex flex-1 flex-col">
              <header className="flex items-center justify-between border-b bg-background px-4 py-2">
                <div className="text-sm font-medium">Dashboard</div>
                {organizationId ? (
                  <RepsAvailabilityBar organizationId={organizationId} />
                ) : (
                  <div className="text-xs text-muted-foreground">…</div>
                )}
              </header>

              <div className="flex-1">{children}</div>
            </main>
          </SidebarProvider>
        </Provider>
      </OrganizationGuard>
    </AuthGuard>
  );
};
