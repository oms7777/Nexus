"use client";

import { UserButton, useClerk, useOrganization, useOrganizationList } from "@clerk/nextjs";
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
import { useMemo, useState } from "react";

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
import { Button } from "@workspace/ui/components/button";

function OrgSwitcherNoCreate() {
  const { organization } = useOrganization();
  const { setActive } = useClerk();
  const { isLoaded, userMemberships } = useOrganizationList({
    userMemberships: { infinite: true },
  });

  const [open, setOpen] = useState(false);

  const memberships = userMemberships?.data ?? [];

  if (!isLoaded) {
    return (
      <div className="w-full h-8 rounded-md bg-muted animate-pulse" />
    );
  }

  return (
    <div className="relative w-full">
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-start h-8 px-2"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate text-xs font-medium">
          {organization?.name ?? "Select organization"}
        </span>
        <span className="ml-auto text-xs opacity-60">▾</span>
      </Button>

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border bg-background shadow-lg p-1">
          {memberships.map((m) => {
            const org = m.organization;
            const active = org.id === organization?.id;

            return (
              <button
                key={org.id}
                className={cn(
                  "w-full text-left rounded-lg px-3 py-2 text-xs hover:bg-muted",
                  active && "bg-muted"
                )}
                onClick={async () => {
                  await setActive({ organization: org.id });
                  setOpen(false);
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate">{org.name}</span>
                  {active ? <span className="ml-auto opacity-60">✓</span> : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const DashboardSidebar = () => {
  const pathname = usePathname();
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";

  const ent = useEntitlements();

  const isActive = (url: string) => pathname === url || pathname.startsWith(`${url}/`);

  const f = ent.features;

  const canSeeIntegrations = !!(f.canUseSlack || f.canUseSalesforce);
  const canUseVoice = !!f.canUseVoice;
  const canUseBooking = !!f.canUseBooking;
  const canUseAdvancedAnalytics = !!f.canUseAdvancedAnalytics;

  const pipelineItems = [
    { title: "Live Map", url: "/live", icon: MapIcon },
    { title: "Conversations", url: "/conversations", icon: InboxIcon },
  ];

  const analyticsItems = useMemo(() => {
    return [
      { title: "Overview", url: "/analytics/overview", icon: BarChart3 },
      { title: "Funnel", url: "/analytics/funnel", icon: Filter },
      { title: "Signals", url: "/analytics/signals", icon: Activity },
    ];
  }, []);

  const profileItems = useMemo(() => {
    const base = [
      { title: "Account", url: "/me/profile", icon: UserIcon },
      { title: "Notifications", url: "/me/notifications", icon: BellIcon },
    ];

    if (canUseBooking) {
      base.splice(1, 0, { title: "Calendar", url: "/me/calendar", icon: CalendarIcon });
    }

    return base;
  }, [canUseBooking]);

  const configurationItems = useMemo(() => {
    if (ent.isLoading) return [];

    return [
      { title: "Team & Territories", url: "/team", icon: Users },
      canSeeIntegrations && { title: "Integrations", url: "/integrations", icon: InboxIcon },
      canUseVoice && { title: "Voice Assistant", url: "/plugins/vapi", icon: Mic },
    ].filter(Boolean) as { title: string; url: string; icon: any }[];
  }, [ent.isLoading, canSeeIntegrations, canUseVoice]);

  return (
    <Sidebar className="group" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <div className="w-full">
                <OrgSwitcherNoCreate />
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
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
            {!canUseAdvancedAnalytics && (
              <p className="px-3 pt-2 text-xs text-muted-foreground">
                Some analytics are limited on your plan.
              </p>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

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
