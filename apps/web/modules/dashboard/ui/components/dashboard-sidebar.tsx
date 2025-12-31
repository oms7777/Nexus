"use client";

import { UserButton, useOrganization, useOrganizationList } from "@clerk/nextjs";
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
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
import { Button } from "@workspace/ui/components/button";

function OrgSwitcherNoCreate() {
  const router = useRouter();
  const { organization } = useOrganization();
  const { isLoaded, userMemberships } = useOrganizationList({
    userMemberships: { infinite: true },
  });

  const [open, setOpen] = useState(false);
  const memberships = userMemberships?.data ?? [];

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-org-switcher-root='true']")) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  if (!isLoaded) {
    return <div className="w-full h-9 rounded-md bg-muted animate-pulse" />;
  }

  return (
    <div className="relative w-full" data-org-switcher-root="true">
      <button
        type="button"
        className="w-full h-9 px-3 rounded-md border bg-background text-left flex items-center gap-2 hover:bg-muted"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate text-sm font-medium">
          {organization?.name ?? "Select organization"}
        </span>
        <span className="ml-auto text-xs opacity-60">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border bg-background shadow-lg p-2 space-y-2">
          <div className="space-y-1">
            {memberships.map((m) => {
              const org = m.organization;
              const active = org.id === organization?.id;

              return (
                <button
                  key={org.id}
                  className={cn(
                    "w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-muted",
                    active && "bg-muted",
                  )}
                  onClick={() => {
                    window.location.href = `/org-selection?redirectURL=${encodeURIComponent(
                      window.location.href,
                    )}`;
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

          <div className="h-px bg-border" />

          <Button
            type="button"
            variant="outline"
            className="w-full h-9 text-sm"
            onClick={() => {
              setOpen(false);
              router.push("/org");
            }}
            disabled={!organization}
          >
            Manage organization
          </Button>
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
      canSeeIntegrations && { title: "Integrations", url: "/integrations", icon: InboxIcon },
      canUseVoice && { title: "Voice Assistant", url: "/plugins/vapi", icon: Mic },
    ].filter(Boolean) as { title: string; url: string; icon: any }[];
  }, [ent.isLoading, canSeeIntegrations, canUseVoice]);

  // ✅ texte caché quand le sidebar est en mode icon
  const labelClass = "group-data-[collapsible=icon]:hidden";

  return (
    <Sidebar className="group" collapsible="icon">
      <SidebarHeader>
        <div className="px-2 pt-2">
          <OrgSwitcherNoCreate />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Pipeline</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {pipelineItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <Link
                    href={item.url}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted",
                      isActive(item.url) && "bg-muted",
                    )}
                  >
                    <item.icon className="size-4" />
                    <span className={labelClass}>{item.title}</span>
                  </Link>
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
                  <Link
                    href={item.url}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted",
                      isActive(item.url) &&
                        "bg-gradient-to-b from-sidebar-primary to-[#0b63f3]! text-sidebar-primary-foreground!",
                    )}
                  >
                    <item.icon className="size-4" />
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
          <SidebarGroupLabel>Profile</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {profileItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <Link
                    href={item.url}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted",
                      isActive(item.url) && "bg-muted",
                    )}
                  >
                    <item.icon className="size-4" />
                    <span className={labelClass}>{item.title}</span>
                  </Link>
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
                    <Link
                      href={item.url}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted",
                        isActive(item.url) && "bg-muted",
                      )}
                    >
                      <item.icon className="size-4" />
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
        <SidebarMenu>
          {/* ✅ enlève le prénom/nom */}
          <UserButton showName={false} />
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
};
