"use client";

import {
  OrganizationSwitcher,
  UserButton,
  useOrganization,
} from "@clerk/nextjs";

import {
  BellIcon,
  CalendarIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LibraryBigIcon,
  MapIcon,
  Mic,
  PaletteIcon,
  UserIcon,
  Users,
} from "lucide-react";

import { BarChart3, Filter, Activity } from "lucide-react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar";

import { cn } from "@workspace/ui/lib/utils";

export const DashboardSidebar = () => {
  const pathname = usePathname();
  const { membership } = useOrganization();

  const isAdmin = membership?.role === "org:admin";

  const isActive = (url: string) =>
    pathname === url || pathname.startsWith(`${url}/`);

  /* ------------------------------ ANALYTICS (all users) ------------------------------ */
  const analyticsItems = [
    { title: "Overview", url: "/analytics/overview", icon: BarChart3 },
    { title: "Funnel", url: "/analytics/funnel", icon: Filter },
    { title: "Signals", url: "/analytics/signals", icon: Activity },
  ];

  /* ------------------------------ PIPELINE / REVENUE (all users) ------------------------------ */
  const pipelineItems = [
    { title: "Live Map", url: "/live", icon: MapIcon },
    { title: "Conversations", url: "/conversations", icon: InboxIcon },
  ];

  /* ------------------------------ PROFILE (all users) ------------------------------ */
  const profileItems = [
    { title: "Account", url: "/me/profile", icon: UserIcon },
    { title: "Calendar", url: "/me/calendar", icon: CalendarIcon },
    { title: "Notifications", url: "/me/notifications", icon: BellIcon },
  ];

  /* ------------------------------ ADMIN CONFIG ------------------------------ */
  const configurationItems = [
    { title: "Widget Customization", url: "/customization", icon: PaletteIcon },
    { title: "Team & Territories", url: "/team", icon: Users },
    { title: "Knowledge Base (AI)", url: "/files", icon: LibraryBigIcon },
    { title: "Integrations", url: "/integrations", icon: LayoutDashboardIcon },
    { title: "Voice Assistant", url: "/plugins/vapi", icon: Mic },
  ];

  return (
    <Sidebar className="group" collapsible="icon">
      {/* HEADER (ORG SWITCHER) */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <OrganizationSwitcher
                hidePersonal
                skipInvitationScreen
                appearance={{
                  elements: {
                    rootBox: "w-full! h-8!",
                    avatarBox: "size-4! rounded-sm!",
                    organizationSwitcherTrigger:
                      "w-full! justify-start! group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!",
                    organizationPreview:
                      "group-data-[collapsible=icon]:justify-center! gap-2",
                    organizationPreviewTextContainer:
                      "group-data-[collapsible=icon]:hidden! text-xs! font-medium!",
                    organizationSwitcherTriggerIcon:
                      "group-data-[collapsible=icon]:hidden! ml-auto!",
                  },
                }}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* ---------------- ANALYTICS ---------------- */}
        <SidebarGroup>
          <SidebarGroupLabel>Analytics</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {analyticsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    className={cn(
                      isActive(item.url) &&
                        "bg-gradient-to-b from-sidebar-primary to-[#0b63f3]! text-sidebar-primary-foreground!"
                    )}
                    tooltip={item.title}
                  >
                    <Link href={item.url}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ---------------- PIPELINE / REVENUE ---------------- */}
        <SidebarGroup>
          <SidebarGroupLabel>Pipeline</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {pipelineItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link href={item.url}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ---------------- PROFILE ---------------- */}
        <SidebarGroup>
          <SidebarGroupLabel>Profile</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {profileItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link href={item.url}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ---------------- ADMIN CONFIG ---------------- */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Configuration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {configurationItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <Link href={item.url}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* FOOTER */}
      <SidebarFooter>
        <SidebarMenu>
          <UserButton showName />
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
};
