"use client";

import { UserButton, useOrganization } from "@clerk/nextjs";
import {
  BellIcon,
  CalendarIcon,
  HomeIcon,
  InboxIcon,
  MapIcon,
  UserIcon,
  Users,
  BookOpen,
  SlidersHorizontal,
  ScrollText,
  ShieldCheck,
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
import { useOrgCapabilities } from "@/modules/auth/hooks/use-org-capabilities";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { LiveVisitorStreamCard } from "@/modules/live/components/LiveVisitorStreamCard";

function BrandHeader() {
  const labelClass = "group-data-[collapsible=icon]:hidden";

  return (
    <div className="px-3 pt-3 pb-2">
      <Link
        href="/home"
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
  const { organization } = useOrganization();
  const { isAdmin, canManageOperations } = useOrgCapabilities();

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
  const [notifTab, setNotifTab] = useState<"escalations" | "settings">("escalations");
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
    { title: "Home", url: "/home", icon: HomeIcon },
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
    const base: { title: string; url: string; icon: typeof UserIcon }[] = [
      { title: "Account", url: "/me/profile", icon: UserIcon },
    ];
    if (canUseBooking) {
      base.push({ title: "Calendar", url: "/me/calendar", icon: CalendarIcon });
    }
    return base;
  }, [canUseBooking]);

  const configurationItems = useMemo(() => {
    if (ent.isLoading) return [];
    const all = [
      { title: "Team & Territories", url: "/team", icon: Users, adminOnly: false },
      { title: "Knowledge Base (AI)", url: "/files", icon: BookOpen, adminOnly: false },
      {
        title: "Widget Customization",
        url: "/customization",
        icon: SlidersHorizontal,
        adminOnly: false,
      },
      { title: "Integrations", url: "/integrations", icon: InboxIcon, adminOnly: true },
      { title: "Audit log", url: "/org/audit", icon: ScrollText, adminOnly: true },
      { title: "Privacy & retention", url: "/org/privacy", icon: ShieldCheck, adminOnly: true },
    ];
    return all.filter((item) => (item.adminOnly ? isAdmin : canManageOperations));
  }, [ent.isLoading, isAdmin, canManageOperations]);

  const labelClass = "group-data-[collapsible=icon]:hidden";
  const iconClass = "size-5";
  const itemClass =
    "flex w-full min-w-0 items-center justify-start gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm hover:bg-muted " +
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
                        "ml-auto shrink-0 rounded-full bg-red-600 text-white text-[11px] px-2 py-0.5",
                        "group-data-[collapsible=icon]:hidden"
                      )}
                    >
                      {Number(escalatedCount ?? 0)}
                    </span>
                  ) : null}
                </button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {configurationItems.length > 0 && (
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

      <Dialog
        open={notifOpen}
        onOpenChange={(open) => {
          setNotifOpen(open);
          if (open) setNotifTab("escalations");
        }}
      >
        <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
          <Tabs
            value={notifTab}
            onValueChange={(v) => setNotifTab(v as "escalations" | "settings")}
            className="gap-0"
          >
            <DialogHeader className="space-y-0 border-b px-6 py-4 text-left">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <DialogTitle className="text-xl font-semibold">Notifications</DialogTitle>
                  <DialogDescription className="mt-1 text-base text-muted-foreground">
                    Escalated visitors assigned to you.
                  </DialogDescription>
                </div>
                {notifTab === "escalations" ? (
                  <div className="shrink-0 sm:pt-0.5">
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
                  </div>
                ) : null}
              </div>
              <TabsList className="mt-4 h-9 w-full max-w-md">
                <TabsTrigger value="escalations" className="flex-1">
                  Escalations
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex-1">
                  Settings
                </TabsTrigger>
              </TabsList>
            </DialogHeader>

            <TabsContent
              value="escalations"
              className="m-0 mt-0 data-[state=active]:block max-h-[min(70vh,720px)] overflow-y-auto p-0 outline-none"
            >
              <div className="p-6">
                {visitors.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                    No escalations right now.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            </TabsContent>

            <TabsContent
              value="settings"
              className="m-0 mt-0 data-[state=active]:block max-h-[min(70vh,720px)] overflow-y-auto border-0 p-0 outline-none"
            >
              <div className="bg-muted/10 p-6">
                <div className="mx-auto w-full max-w-lg space-y-4">
                  <div className="text-sm font-semibold">Settings</div>
                  <div className="space-y-4">
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
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">Play sound</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Beep when new escalations arrive.
                        </div>
                      </div>
                      <Switch checked={playSoundLocal} onCheckedChange={(v) => setPlaySoundLocal(Boolean(v))} />
                    </div>

                    <Button
                      type="button"
                      className="w-full"
                      onClick={async () => {
                        await savePrefs({
                          showBadges: showBadgesLocal,
                          playSound: playSoundLocal,
                          autoOpenConversation: false,
                        });
                        setNotifTab("escalations");
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
};
