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
  ScrollText,
} from "lucide-react";
import { BarChart3, Filter, Activity } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

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
import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

function BrandHeader() {
  const labelClass = "group-data-[collapsible=icon]:hidden";

  return (
    <div className="px-3 pt-3 pb-2">
      <Link
        href="/"
        className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted"
      >
        <img src="/logoo.jpg" alt="Inboundless" className="h-7 w-7 shrink-0 rounded-sm object-cover" />
        <span className={cn("font-semibold tracking-tight", labelClass)}>
          Inboundless
        </span>
      </Link>
    </div>
  );
}

function playBeep() {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 120);
  } catch {}
}

export const DashboardSidebar = () => {
  const pathname = usePathname();
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";

  const ent = useEntitlements();
  const isActive = (url: string) =>
    pathname === url || pathname.startsWith(`${url}/`);

  const f = ent.features;
  const canUseVoice = !!f.canUseVoice;
  const canUseBooking = !!f.canUseBooking;
  const canUseAdvancedAnalytics = !!f.canUseAdvancedAnalytics;

  // ✅ count unseen escalated conversations (badge + sound) — disparaît quand l'opérateur ouvre la conv
  const escalatedCount = useQuery(api.private.conversations.countUnseenEscalated, {});

  // ✅ notification prefs: badge + sound respect user settings
  const notifPrefs = useQuery(api.private.notifications.meNotificationPrefs, {});
  const showBadges = notifPrefs?.showBadges ?? true;
  const playSoundEnabled = notifPrefs?.playSound ?? true;

  const prevCountRef = useRef<number>(0);
  useEffect(() => {
    const next = Number(escalatedCount ?? 0);
    const prev = prevCountRef.current;

    if (playSoundEnabled && prev !== 0 && next > prev) {
      playBeep();
    }
    prevCountRef.current = next;
  }, [escalatedCount, playSoundEnabled]);

  const pipelineItems = [
    { title: "Live Map", url: "/live", icon: MapIcon },
    {
      title: "Conversations",
      url: "/conversations",
      icon: InboxIcon,
      badge: showBadges ? Number(escalatedCount ?? 0) : 0,
    },
  ];

  const analyticsItems = useMemo(() => {
    const base = [{ title: "Overview", url: "/analytics/overview", icon: BarChart3 }];
    if (canUseAdvancedAnalytics) {
      base.push(
        { title: "Funnel", url: "/analytics/funnel", icon: Filter },
        { title: "Signals", url: "/analytics/signals", icon: Activity },
      );
    }
    return base;
  }, [canUseAdvancedAnalytics]);

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
      { title: "Knowledge Base (AI)", url: "/files", icon: BookOpen },
      { title: "Widget Customization", url: "/customization", icon: SlidersHorizontal },
      { title: "Integrations", url: "/integrations", icon: InboxIcon },
      { title: "Audit log", url: "/org/audit", icon: ScrollText },
      canUseVoice && { title: "Voice Assistant", url: "/plugins/vapi", icon: Mic },
    ].filter(Boolean) as { title: string; url: string; icon: any }[];
  }, [ent.isLoading, canUseVoice]);

  const labelClass = "group-data-[collapsible=icon]:hidden";
  const iconClass = "size-5";
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

                    {/* ✅ badge */}
                    {!!item.badge && item.badge > 0 && (
                      <span
                        className={cn(
                          "ml-auto rounded-full bg-red-600 text-white text-[11px] px-2 py-0.5",
                          "group-data-[collapsible=icon]:hidden"
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
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
                        "bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white"
                    )}
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
            <SidebarGroupLabel className={labelClass}>Configuration</SidebarGroupLabel>
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
