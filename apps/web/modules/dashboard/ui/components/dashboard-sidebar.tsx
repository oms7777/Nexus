"use client";

import { UserButton, useOrganization } from "@clerk/nextjs";
import {
  BellIcon,
  CalendarIcon,
  InboxIcon,
  MapIcon,
  UserIcon,
  Users,
  BookOpen,
  SlidersHorizontal,
  ScrollText,
} from "lucide-react";
import { BarChart3, Filter, Activity } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { SIDEBAR_ITEM_ACTIVE } from "@/modules/analytics/shared/analytics-primitives";
import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Switch } from "@workspace/ui/components/switch";
import { LiveVisitorStreamCard } from "@/modules/live/components/LiveVisitorStreamCard";

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
  const router = useRouter();
  const { membership, organization } = useOrganization();
  const isAdmin = membership?.role === "org:admin";

  const ent = useEntitlements();
  const isActive = (url: string) =>
    pathname === url || pathname.startsWith(`${url}/`);

  const f = ent.features;
  const canUseBooking = !!f.canUseBooking;
  const canUseAdvancedAnalytics = !!f.canUseAdvancedAnalytics;

  // ✅ count unseen escalated conversations (badge + sound) — disparaît quand l'opérateur ouvre la conv
  const escalatedCount = useQuery(api.private.conversations.countUnseenEscalated, {});

  // ✅ notification prefs: badge + sound respect user settings
  const notifPrefs = useQuery(api.private.notifications.meNotificationPrefs, {});
  const showBadges = notifPrefs?.showBadges ?? true;
  const playSoundEnabled = notifPrefs?.playSound ?? true;
  const savePrefs = useMutation(api.private.notifications.saveMeNotificationPrefs);
  const markAllViewed = useMutation(api.private.conversations.markAllEscalatedViewedForMe);
  const escalations = useQuery(api.private.notifications.listUnseenEscalationsForMe, {});

  const prevCountRef = useRef<number>(0);
  useEffect(() => {
    const next = Number(escalatedCount ?? 0);
    const prev = prevCountRef.current;

    if (playSoundEnabled && prev !== 0 && next > prev) {
      playBeep();
    }
    prevCountRef.current = next;
  }, [escalatedCount, playSoundEnabled]);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const [showBadgesLocal, setShowBadgesLocal] = useState(showBadges);
  const [playSoundLocal, setPlaySoundLocal] = useState(playSoundEnabled);

  useEffect(() => {
    setShowBadgesLocal(showBadges);
  }, [showBadges]);
  useEffect(() => {
    setPlaySoundLocal(playSoundEnabled);
  }, [playSoundEnabled]);

  const visitors = useMemo(() => {
    const list = Array.isArray(escalations) ? escalations : [];
    return list.map((e: any) => ({
      _id: String(e.conversationId),
      name: e.visitor?.name,
      email: e.visitor?.email,
      city: e.visitor?.city,
      countryCode: e.visitor?.countryCode,
      currentUrl: e.visitor?.currentUrl,
      title: e.visitor?.title,
      pageUrls: e.visitor?.pageUrls,
      pageCount: e.visitor?.pageCount,
      timeOnSiteMs: e.visitor?.timeOnSiteMs,
      contactSessionId: String(e.contactSessionId),
      conversationId: String(e.conversationId),
      userAgent: e.visitor?.userAgent,
    }));
  }, [escalations]);

  const pipelineItems = [
    { title: "Live Map", url: "/live", icon: MapIcon },
    {
      title: "Conversations",
      url: "/conversations",
      icon: InboxIcon,
      badge: 0,
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
    ].filter(Boolean) as { title: string; url: string; icon: any }[];
  }, [ent.isLoading]);

  const labelClass = "group-data-[collapsible=icon]:hidden";
  const iconClass = "size-5";
  const itemClass =
    "flex items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm hover:bg-muted " +
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
                    className={cn(itemClass, isActive(item.url) && SIDEBAR_ITEM_ACTIVE)}
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
                    className={cn(itemClass, isActive(item.url) && SIDEBAR_ITEM_ACTIVE)}
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
              <SidebarMenuItem key="Notifications">
                <button
                  type="button"
                  onClick={() => setNotifOpen(true)}
                  className={cn(itemClass, notifOpen && SIDEBAR_ITEM_ACTIVE)}
                  title="Notifications"
                >
                  <BellIcon className={iconClass} />
                  <span className={labelClass}>Notifications</span>
                  {showBadges && Number(escalatedCount ?? 0) > 0 ? (
                    <span
                      className={cn(
                        "ml-auto rounded-full bg-red-600 text-white text-[11px] px-2 py-0.5",
                        "group-data-[collapsible=icon]:hidden"
                      )}
                    >
                      {Number(escalatedCount ?? 0)}
                    </span>
                  ) : null}
                </button>
              </SidebarMenuItem>
              {profileItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <Link
                    href={item.url}
                    className={cn(itemClass, isActive(item.url) && SIDEBAR_ITEM_ACTIVE)}
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
                      className={cn(itemClass, isActive(item.url) && SIDEBAR_ITEM_ACTIVE)}
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

      <Dialog open={notifOpen} onOpenChange={setNotifOpen}>
        <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
          <DialogHeader className="space-y-1 border-b px-6 py-5 text-left">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="text-xl font-semibold">Notifications</DialogTitle>
                <DialogDescription className="text-base text-muted-foreground">
                  Escalated visitors assigned to you.
                </DialogDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await markAllViewed({});
                  }}
                  disabled={Number(escalatedCount ?? 0) === 0}
                >
                  Mark all as read
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setNotifSettingsOpen((v) => !v)}
                >
                  Settings
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_340px]">
            <div className="max-h-[70vh] overflow-auto p-6">
              {visitors.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                  No escalations right now.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {visitors.map((v) => (
                    <LiveVisitorStreamCard
                      key={v._id}
                      visitor={v as any}
                      orgId={(organization?.id || "") as any}
                      isSelected={false}
                      onSelect={() => {}}
                      mode="open_conversation"
                      onOpenConversation={() => {
                        setNotifOpen(false);
                        router.push(`/conversations/${v.conversationId}`);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="border-l bg-muted/10 p-6">
              <div className="text-sm font-semibold">Settings</div>
              <div className={cn("mt-3 space-y-4", notifSettingsOpen ? "" : "opacity-50")}>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Show badge</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Show the escalated count next to the bell.
                    </div>
                  </div>
                  <Switch
                    checked={showBadgesLocal}
                    onCheckedChange={(v) => setShowBadgesLocal(Boolean(v))}
                    disabled={!notifSettingsOpen}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Play sound</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Beep when new escalations arrive.
                    </div>
                  </div>
                  <Switch
                    checked={playSoundLocal}
                    onCheckedChange={(v) => setPlaySoundLocal(Boolean(v))}
                    disabled={!notifSettingsOpen}
                  />
                </div>

                <Button
                  type="button"
                  className="w-full"
                  disabled={!notifSettingsOpen}
                  onClick={async () => {
                    await savePrefs({
                      showBadges: showBadgesLocal,
                      playSound: playSoundLocal,
                      autoOpenConversation: false,
                    });
                    setNotifSettingsOpen(false);
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
};
