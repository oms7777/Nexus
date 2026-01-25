"use client";

import Bowser from "bowser";
import React, { useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { Button } from "@workspace/ui/components/button";
import { DicebearAvatar } from "@workspace/ui/components/dicebear-avatar";

import { getCountryFlagUrl, getCountryFromTimezone } from "@/lib/country-utils";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";

import {
  ClockIcon,
  GlobeIcon,
  MailIcon,
  MonitorIcon,
  LinkIcon,
  CalendarIcon,
} from "lucide-react";

import { SnapshotsStrip } from "./SnapshotsStrip";
import { LiveVisitorView } from "./live-visitor-view";

type InfoItem = {
  label: string;
  value: string | React.ReactNode;
  className?: string;
};

type InfoSection = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: InfoItem[];
};

function formatDuration(ms: number) {
  if (ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function parseUtm(url?: string) {
  try {
    if (!url) return null;
    const u = new URL(url);
    const p = u.searchParams;
    const utm = {
      source: p.get("utm_source") || undefined,
      medium: p.get("utm_medium") || undefined,
      campaign: p.get("utm_campaign") || undefined,
      term: p.get("utm_term") || undefined,
      content: p.get("utm_content") || undefined,
    };
    const hasAny = Object.values(utm).some(Boolean);
    return hasAny ? utm : null;
  } catch {
    return null;
  }
}

export const ContactPanel = () => {
  const params = useParams();
  const conversationId = params.conversationId as Id<"conversations"> | null;

  const contactSession = useQuery(
    api.private.contactSessions.getOneByConversationId,
    conversationId ? { conversationId } : "skip",
  );

  const parseUserAgent = useMemo(() => {
    return (userAgent?: string) => {
      if (!userAgent) {
        return { browser: "Unknown", os: "Unknown", device: "Unknown" };
      }

      const browser = Bowser.getParser(userAgent);
      const result = browser.getResult();

      return {
        browser: result.browser.name || "Unknown",
        browserVersion: result.browser.version || "",
        os: result.os.name || "Unknown",
        osVersion: result.os.version || "",
        device: result.platform.type || "desktop",
        deviceVendor: result.platform.vendor || "",
        deviceModel: result.platform.model || "",
      };
    };
  }, []);

  const userAgentInfo = useMemo(
    () => parseUserAgent(contactSession?.metadata?.userAgent),
    [contactSession?.metadata?.userAgent, parseUserAgent],
  );

  const countryInfo = useMemo(() => {
    return getCountryFromTimezone(contactSession?.metadata?.timezone);
  }, [contactSession?.metadata?.timezone]);

  const cityLabel = contactSession?.metadata?.city ?? undefined;

  const utm = useMemo(
    () => parseUtm(contactSession?.metadata?.currentUrl),
    [contactSession?.metadata?.currentUrl],
  );

  const timeOnSite = useMemo(() => {
    if (!contactSession?._creationTime) return "—";
    return formatDuration(Date.now() - contactSession._creationTime);
  }, [contactSession?._creationTime]);

  // Pages (on garde un cap 5 pour l’accordion)
  const lastPages = useMemo(() => {
    const pages = (contactSession?.metadata?.pages ?? []) as string[];
    if (pages.length) return pages.slice(0, 5);

    const current = contactSession?.metadata?.currentUrl;
    const ref = contactSession?.metadata?.referrer;
    const list: string[] = [];
    if (current) list.push(current);
    if (ref && ref !== current) list.push(ref);
    return list.slice(0, 5);
  }, [
    contactSession?.metadata?.pages,
    contactSession?.metadata?.currentUrl,
    contactSession?.metadata?.referrer,
  ]);

  const allPages = useMemo(() => {
    const pages = (contactSession?.metadata?.pages ?? []) as string[];
    return Array.isArray(pages) ? pages.filter(Boolean).slice(0, 10) : [];
  }, [contactSession?.metadata?.pages]);

  const currentUrl = contactSession?.metadata?.currentUrl ?? "";

  const handleQuickBook = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("nexus:open-inline-booker", { detail: {} }),
      );
    }
  }, []);

  const accordionSections = useMemo<InfoSection[]>(() => {
    if (!contactSession?.metadata) return [];

    return [
      {
        id: "device-info",
        icon: MonitorIcon,
        title: "Device Information",
        items: [
          {
            label: "Browser",
            value:
              userAgentInfo.browser +
              (userAgentInfo.browserVersion
                ? ` ${userAgentInfo.browserVersion}`
                : ""),
          },
          {
            label: "OS",
            value:
              userAgentInfo.os +
              (userAgentInfo.osVersion ? ` ${userAgentInfo.osVersion}` : ""),
          },
          {
            label: "Device",
            value:
              userAgentInfo.device +
              (userAgentInfo.deviceModel ? ` - ${userAgentInfo.deviceModel}` : ""),
            className: "capitalize",
          },
          { label: "Screen", value: contactSession.metadata.screenResolution || "—" },
          { label: "Viewport", value: contactSession.metadata.viewportSize || "—" },
          {
            label: "Cookies",
            value: contactSession.metadata.cookieEnabled ? "Enabled" : "Disabled",
          },
        ],
      },
      {
        id: "location-info",
        icon: GlobeIcon,
        title: "Location & Language",
        items: [
          ...(cityLabel ? [{ label: "City", value: cityLabel }] : []),
          ...(countryInfo
            ? [
                {
                  label: "Country",
                  value: (
                    <span className="inline-flex items-center gap-2">
                      {countryInfo.code && (
                        <img
                          alt={countryInfo.name || "Country"}
                          className="h-4 w-6 rounded-sm"
                          src={getCountryFlagUrl(countryInfo.code)}
                        />
                      )}
                      {countryInfo.name ?? "—"}
                    </span>
                  ),
                },
              ]
            : []),
          { label: "Language", value: contactSession.metadata.language || "—" },
          { label: "Timezone", value: contactSession.metadata.timezone || "—" },
          {
            label: "UTC Offset",
            value:
              typeof contactSession.metadata.timezoneOffset === "number"
                ? `UTC${contactSession.metadata.timezoneOffset >= 0 ? "+" : ""}${
                    contactSession.metadata.timezoneOffset / 60
                  }`
                : "—",
          },
        ],
      },
      {
        id: "browsing",
        icon: LinkIcon,
        title: "Browsing Context",
        items: [
          {
            label: "Current Page",
            value: contactSession.metadata.currentUrl ? (
              <a
                className="truncate underline"
                href={contactSession.metadata.currentUrl}
                rel="noreferrer"
                target="_blank"
                title={contactSession.metadata.currentUrl}
              >
                {contactSession.metadata.currentUrl}
              </a>
            ) : (
              "—"
            ),
          },
          {
            label: "Referrer",
            value: contactSession.metadata.referrer ? (
              <a
                className="truncate underline"
                href={contactSession.metadata.referrer}
                rel="noreferrer"
                target="_blank"
                title={contactSession.metadata.referrer}
              >
                {contactSession.metadata.referrer}
              </a>
            ) : (
              "—"
            ),
          },
          ...(utm
            ? [
                {
                  label: "UTM",
                  value: (
                    <span className="block truncate">
                      {[
                        utm.source && `source=${utm.source}`,
                        utm.medium && `medium=${utm.medium}`,
                        utm.campaign && `campaign=${utm.campaign}`,
                        utm.term && `term=${utm.term}`,
                        utm.content && `content=${utm.content}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ),
                },
              ]
            : []),
          {
            label: "Last 5 pages",
            value:
              lastPages.length > 0 ? (
                <div className="flex flex-col items-end gap-1 text-right">
                  {lastPages.map((u) => (
                    <a
                      key={u}
                      className="truncate underline"
                      href={u}
                      rel="noreferrer"
                      target="_blank"
                      title={u}
                    >
                      {u}
                    </a>
                  ))}
                </div>
              ) : (
                "—"
              ),
          },
        ],
      },
      {
        id: "section-details",
        title: "Session details",
        icon: ClockIcon,
        items: [
          {
            label: "Session Started",
            value: new Date(contactSession._creationTime).toLocaleString(),
          },
          { label: "Time on Site", value: timeOnSite },
        ],
      },
    ];
  }, [contactSession, userAgentInfo, countryInfo, cityLabel, utm, lastPages, timeOnSite]);

  if (contactSession === undefined || contactSession === null) return null;

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <div className="flex flex-col gap-y-4 p-4">
        <div className="flex items-center gap-x-2">
          <DicebearAvatar
            badgeImageUrl={
              countryInfo?.code ? getCountryFlagUrl(countryInfo.code) : undefined
            }
            seed={contactSession._id}
            size={42}
          />
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-x-2">
              <h4 className="line-clamp-1">{contactSession.name}</h4>
            </div>
            <p className="line-clamp-1 text-sm text-muted-foreground">
              {contactSession.email}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button asChild className="w-full" size="lg" variant="default">
            <Link href={`mailto:${contactSession.email}`}>
              <MailIcon className="mr-2 h-4 w-4" />
              <span>Send Email</span>
            </Link>
          </Button>

          <Button
            className="w-full"
            onClick={handleQuickBook}
            size="lg"
            variant="secondary"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            <span>Quick-book</span>
          </Button>
        </div>
      </div>

      <div>
        {contactSession.metadata && (
          <Accordion className="w-full rounded-none border-y" collapsible type="single">
            {accordionSections.map((section) => (
              <AccordionItem
                className="rounded-none outline-none has-focus-visible:z-10 has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
                key={section.id}
                value={section.id}
              >
                <AccordionTrigger className="flex w-full flex-1 items-start justify-between gap-4 rounded-none bg-accent px-5 py-4 text-left text-sm font-medium outline-none transition-all hover:no-underline disabled:pointer-events-none disabled:opacity-50">
                  <div className="flex items-center gap-4">
                    <section.icon className="size-4 shrink-0" />
                    <span>{section.title}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5 py-4">
                  <div className="space-y-2 text-sm">
                    {section.items.map((item) => (
                      <div className="flex justify-between" key={`${section.id}-${item.label}`}>
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className={item.className}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        {/* Live view + pages (sans cadre preview gris) */}
        <div className="border-t p-4">
          <div className="mb-2 flex items-center justify-between">
            <h5 className="text-sm font-medium">Live view</h5>
          </div>

          {/* ✅ même rendu que sur ta capture : "Live view https://..." */}
          {currentUrl ? (
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-xs text-muted-foreground hover:underline"
              title={currentUrl}
            >
              <span className="text-foreground">Live view</span>{" "}
              <span className="truncate">{currentUrl}</span>
            </a>
          ) : (
            <div className="text-xs text-muted-foreground">Live view —</div>
          )}

          {/* ✅ Pages visited */}
          <div className="mt-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Pages visited
            </div>

            {allPages.length ? (
              <div className="space-y-2">
                {allPages.map((url, idx) => (
                  <a
                    key={`${url}_${idx}`}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded border bg-muted/30 px-3 py-2 text-xs hover:bg-muted/50"
                    title={url}
                  >
                    <div className="truncate">{url}</div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No pages yet</div>
            )}
          </div>

          
          <div className="mt-4">
            <LiveVisitorView
              orgId={contactSession.organizationId}
              convexSessionId={String(contactSession._id)}
              streamSessionId={String(
                (contactSession as any).externalSessionId || contactSession._id
              )}
              clickUrl={contactSession.metadata?.currentUrl || undefined}
              height={360}
            />
            <SnapshotsStrip sessionId={contactSession._id} limit={8} />
          </div>
        </div>
      </div>
    </div>
  );
};
