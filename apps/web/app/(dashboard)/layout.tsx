import { DashboardLayout } from "@/modules/dashboard/ui/layouts/dashboard-layout";
import { SidebarProvider } from "@workspace/ui/components/sidebar";



const Layout = ({ children }: {children: React.ReactNode; }) => {
    return (
        <DashboardLayout>
            {children}
        </DashboardLayout>
    )
}

export default Layout;