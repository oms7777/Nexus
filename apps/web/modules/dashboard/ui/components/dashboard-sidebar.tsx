// dashboardsidebar.tsx
"use client";

import { OrganizationSwitcher, UserButton, useOrganization } from "@clerk/nextjs";
import {
  BellIcon,
  CalendarIcon,
  InboxIcon,
  MapIcon,
  Mic,
  UserIcon,
  Users,
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar";

import { cn } from "@workspace/ui/lib/utils";
import { useEntitlements } from "@/modules/billing/hooks/use-entitlements";

export const DashboardSidebar = () => {
  const pathname = usePathname();
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";

  const ent = useEntitlements();

  const isActive = (url: string) => pathname === url || pathname.startsWith(`${url}/`);

  // ✅ feature flags (exactement ceux qui existent)
  const f = ent.features;

  const canSeeIntegrations = !!(f.canUseSlack || f.canUseSalesforce);
  const canUseVoice = !!f.canUseVoice;
  const canUseBooking = !!f.canUseBooking;
  const canUseAdvancedAnalytics = !!f.canUseAdvancedAnalytics;

  /* ------------------------------ PIPELINE (all users) ------------------------------ */
  const pipelineItems = [
    { title: "Live Map", url: "/live", icon: MapIcon },
    { title: "Conversations", url: "/conversations", icon: InboxIcon },
  ];

  /* ------------------------------ ANALYTICS ------------------------------ */
  const analyticsItems = useMemo(() => {
    // tu peux décider de toujours montrer Analytics,
    // ou de le limiter si pas Advanced Analytics.
    // Ici: Analytics toujours visible, mais tu peux plus tard
    // griser/locker les pages avancées.
    return [
      { title: "Overview", url: "/analytics/overview", icon: BarChart3 },
      { title: "Funnel", url: "/analytics/funnel", icon: Filter },
      { title: "Signals", url: "/analytics/signals", icon: Activity },
    ];
  }, []);

  /* ------------------------------ PROFILE ------------------------------ */
  const profileItems = useMemo(() => {
    const base = [
      { title: "Account", url: "/me/profile", icon: UserIcon },
      { title: "Notifications", url: "/me/notifications", icon: BellIcon },
    ];

    // ✅ Booking/calendar only if allowed
    if (canUseBooking) {
      base.splice(1, 0, { title: "Calendar", url: "/me/calendar", icon: CalendarIcon });
    }

    return base;
  }, [canUseBooking]);

  /* ------------------------------ ADMIN CONFIG (gated) ------------------------------ */
  const configurationItems = useMemo(() => {
    if (ent.isLoading) return [];

    return [
      // Team & Territories (existe côté produit) :
      // si tu veux le caper plus tard, ajoute un flag (ex: canUseAdvancedRouting)
      {
        title: "Team & Territories",
        url: "/team",
        icon: Users,
      },

      // Integrations (Slack/SF)
      canSeeIntegrations && {
        title: "Integrations",
        url: "/integrations",
        icon: InboxIcon,
      },

      // Voice
      canUseVoice && {
        title: "Voice Assistant",
        url: "/plugins/vapi",
        icon: Mic,
      },
    ].filter(Boolean) as { title: string; url: string; icon: any }[];
  }, [ent.isLoading, canSeeIntegrations, canUseVoice]);

  return (
    <Sidebar className="group" collapsible="icon">
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
                    organizationPreview: "group-data-[collapsible=icon]:justify-center! gap-2",
                    organizationPreviewTextContainer:
                      "group-data-[collapsible=icon]:hidden! text-xs! font-medium!",
                    organizationSwitcherTriggerIcon: "group-data-[collapsible=icon]:hidden! ml-auto!",
                  },
                }}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* PIPELINE */}
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

        {/* ANALYTICS */}
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
            {/* Optionnel: badge/lock pour advanced analytics */}
            {!canUseAdvancedAnalytics && (
              <p className="px-3 pt-2 text-xs text-muted-foreground">
                Some analytics are limited on your plan.
              </p>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        {/* PROFILE */}
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

        {/* ADMIN CONFIG */}
        {isAdmin && configurationItems.length > 0 && (
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

      <SidebarFooter>
        <SidebarMenu>
          <UserButton showName />
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
};
