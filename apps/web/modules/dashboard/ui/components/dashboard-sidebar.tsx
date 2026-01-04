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

function BrandHeader() {
  // ✅ “Inboundless + logo” et en mode icon => logo only
  const labelClass = "group-data-[collapsible=icon]:hidden";

  return (
    <div className="px-3 pt-3 pb-2">
      <Link
        href="/"
        className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted"
      >
        <img
          src="/logoo.jpg"
          alt="Inboundless"
          className="h-7 w-7 shrink-0"
        />
        <span className={cn("font-semibold tracking-tight", labelClass)}>
          Inboundless
        </span>
      </Link>
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
      { title: "Widget Customization", url: "/customization", icon: SlidersHorizontal },
      canSeeIntegrations && {
        title: "Integrations",
        url: "/integrations",
        icon: InboxIcon,
      },
      canUseVoice && { title: "Voice Assistant", url: "/plugins/vapi", icon: Mic },
    ].filter(Boolean) as { title: string; url: string; icon: any }[];
  }, [ent.isLoading, canSeeIntegrations, canUseVoice]);

  // ✅ texte caché quand le sidebar est en mode icon
  const labelClass = "group-data-[collapsible=icon]:hidden";

  // ✅ icônes + grandes (avant: size-4)
  const iconClass = "size-5";

  // ✅ meilleur look en “icon mode” (boutons plus carrés / centrés)
  const itemClass =
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted " +
    "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2";

  return (
    <Sidebar className="group" collapsible="icon">
      <SidebarHeader>
        <BrandHeader />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className={labelClass}>Pipeline</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {pipelineItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <Link
                    href={item.url}
                    className={cn(itemClass, isActive(item.url) && "bg-muted")}
                    title={item.title}
                  >
                    <item.icon className={iconClass} />
                    <span className={labelClass}>{item.title}</span>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className={labelClass}>Analytics</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {analyticsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <Link
                    href={item.url}
                    className={cn(
                      itemClass,
                      isActive(item.url) &&
                        "bg-gradient-to-b from-sidebar-primary to-[#0b63f3]! text-sidebar-primary-foreground!",
                    )}
                    title={item.title}
                  >
                    <item.icon className={iconClass} />
                    <span className={labelClass}>{item.title}</span>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>

            {!canUseAdvancedAnalytics && (
              <p className={cn("px-3 pt-2 text-xs text-muted-foreground", labelClass)}>
                Some analytics are limited on your plan.
              </p>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className={labelClass}>Profile</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {profileItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <Link
                    href={item.url}
                    className={cn(itemClass, isActive(item.url) && "bg-muted")}
                    title={item.title}
                  >
                    <item.icon className={iconClass} />
                    <span className={labelClass}>{item.title}</span>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && configurationItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className={labelClass}>
              Configuration
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {configurationItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <Link
                      href={item.url}
                      className={cn(itemClass, isActive(item.url) && "bg-muted")}
                      title={item.title}
                    >
                      <item.icon className={iconClass} />
                      <span className={labelClass}>{item.title}</span>
                    </Link>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu className="px-2 pb-2">
          <UserButton showName={false} />
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
};
