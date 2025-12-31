"use client";

import { UserButton, useOrganization } from "@clerk/nextjs";
import {
  BellIcon,
  CalendarIcon,
  InboxIcon,
  MapIcon,
  Mic,
  UserIcon,
  Users,
  BookOpen,
  SlidersHorizontal,
} from "lucide-react";
import { BarChart3, Filter, Activity } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar";

import { cn } from "@workspace/ui/lib/utils";
import { useEntitlements } from "@/modules/billing/hooks/use-entitlements";

function InboundlessLogo() {
  return (
    <div className="flex items-center gap-2 px-2 pt-2">
      {/* Remplace par ton vrai logo (img / svg) */}
      <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center font-bold">
        I
      </div>
      {/* ✅ caché quand sidebar collapsed */}
      <div className="leading-tight group-data-[collapsible=icon]:hidden">
        <div className="text-sm font-semibold">Inboundless</div>
        <div className="text-xs text-muted-foreground">Dashboard</div>
      </div>
    </div>
  );
}

export const DashboardSidebar = () => {
  const pathname = usePathname();
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";

  const ent = useEntitlements();
  const isActive = (url: string) =>
    pathname === url || pathname.startsWith(`${url}/`);

  const f = ent.features;
  const canSeeIntegrations = !!(f.canUseSlack || f.canUseSalesforce);
  const canUseVoice = !!f.canUseVoice;
  const canUseBooking = !!f.canUseBooking;
  const canUseAdvancedAnalytics = !!f.canUseAdvancedAnalytics;

  const pipelineItems = [
    { title: "Live Map", url: "/live", icon: MapIcon },
    { title: "Conversations", url: "/conversations", icon: InboxIcon },
  ];

  const analyticsItems = useMemo(
    () => [
      { title: "Overview", url: "/analytics/overview", icon: BarChart3 },
      { title: "Funnel", url: "/analytics/funnel", icon: Filter },
      { title: "Signals", url: "/analytics/signals", icon: Activity },
    ],
    [],
  );

  const profileItems = useMemo(() => {
    const base = [
      { title: "Account", url: "/me/profile", icon: UserIcon },
      { title: "Notifications", url: "/me/notifications", icon: BellIcon },
    ];

    if (canUseBooking) {
      base.splice(1, 0, {
        title: "Calendar",
        url: "/me/calendar",
        icon: CalendarIcon,
      });
    }
    return base;
  }, [canUseBooking]);

  const configurationItems = useMemo(() => {
    if (ent.isLoading) return [];

    return [
      { title: "Team & Territories", url: "/team", icon: Users },
      { title: "Knowledge Base (AI)", url: "/files", icon: BookOpen },
      {
        title: "Widget Customization",
        url: "/customization",
        icon: SlidersHorizontal,
      },
      canSeeIntegrations && {
        title: "Integrations",
        url: "/integrations",
        icon: InboxIcon,
      },
      canUseVoice && {
        title: "Voice Assistant",
        url: "/plugins/vapi",
        icon: Mic,
      },
    ].filter(Boolean) as { title: string; url: string; icon: any }[];
  }, [ent.isLoading, canSeeIntegrations, canUseVoice]);

  const NavLink = ({
    item,
    activeClassName,
  }: {
    item: { title: string; url: string; icon: any };
    activeClassName?: string;
  }) => {
    return (
      <Link
        href={item.url}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted",
          // ✅ quand sidebar collapsed : center l’icône et cache le label
          "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2",
          isActive(item.url) && (activeClassName ?? "bg-muted"),
        )}
      >
        <item.icon className="size-4 shrink-0" />
        <span className="truncate group-data-[collapsible=icon]:hidden">
          {item.title}
        </span>
      </Link>
    );
  };

  return (
    <Sidebar className="group" collapsible="icon">
      <SidebarHeader>
        <InboundlessLogo />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            Pipeline
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {pipelineItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <NavLink item={item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            Analytics
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {analyticsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <NavLink
                    item={item}
                    activeClassName="bg-gradient-to-b from-sidebar-primary to-[#0b63f3]! text-sidebar-primary-foreground!"
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>

            {!canUseAdvancedAnalytics && (
              <p className="px-3 pt-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                Some analytics are limited on your plan.
              </p>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            Profile
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {profileItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <NavLink item={item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && configurationItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
              Configuration
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {configurationItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <NavLink item={item} />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {/* si tu veux aussi cacher le nom en collapsed : showName={false} + custom */}
          <UserButton showName />
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
};
