"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, MapPin, MessageCircle } from "lucide-react";
import { Id } from "@workspace/backend/_generated/dataModel";
import { LiveVisitorView } from "@/modules/dashboard/ui/components/live-visitor-view";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import type { Visitor } from "./LiveMap";

function fmtTimeOnSite(ms?: number) {
  if (!ms || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function pathLabel(url?: string) {
  if (!url) return "—";
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || u.href;
  } catch {
    return url;
  }
}

export function LiveVisitorStreamCard({
  visitor,
  orgId,
  isSelected,
  onSelect,
  mode = "select",
  onOpenConversation,
}: {
  visitor: Visitor;
  orgId: string;
  isSelected: boolean;
  onSelect: () => void;
  mode?: "select" | "open_conversation";
  onOpenConversation?: () => void;
}) {
  const sessionId = visitor.contactSessionId
    ? (visitor.contactSessionId as Id<"contactSessions">)
    : null;
  const [urlsOpen, setUrlsOpen] = useState(false);

  const raw = visitor.pageUrls ?? [];
  const pageTrail = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of raw) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
    return out;
  }, [raw]);

  return (
    <div
      className={cn(
        "rounded-xl border bg-card text-left shadow-sm ring-1 transition",
        "hover:border-fuchsia-300/80 dark:hover:border-fuchsia-700/50",
        isSelected
          ? "border-fuchsia-400 ring-2 ring-fuchsia-200/80 dark:border-fuchsia-600 dark:ring-fuchsia-900/50"
          : "border-border ring-black/[0.04] dark:ring-white/10",
      )}
    >
      <div
        className="cursor-pointer"
        onClick={() => {
          if (mode === "open_conversation" && visitor.conversationId && onOpenConversation) {
            onOpenConversation();
            return;
          }
          onSelect();
        }}
      >
        <div className="flex items-start justify-between gap-2 border-b border-border/70 bg-gradient-to-r from-fuchsia-50/50 to-transparent px-3 py-2.5 dark:from-fuchsia-950/20">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {visitor.conversationId ? (
                <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-800 dark:text-orange-300">
                  Live chat
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Browsing
                </span>
              )}
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-foreground">
              {visitor.name || "Visitor"}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <span className="tabular-nums">{fmtTimeOnSite(visitor.timeOnSiteMs)} on site</span>
              {visitor.city || visitor.countryCode ? (
                <>
                  <span>·</span>
                  <MapPin className="size-3 shrink-0 opacity-70" aria-hidden />
                  <span className="truncate">
                    {visitor.city}
                    {visitor.countryCode ? ` · ${visitor.countryCode}` : ""}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-2 pb-2 pt-2" onClick={(e) => e.stopPropagation()}>
          {sessionId && isSelected ? (
            <LiveVisitorView orgId={orgId} sessionId={sessionId} compact currentUrl={visitor.currentUrl} />
          ) : (
            <div className="flex min-h-[128px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/30 px-3 text-center text-xs text-muted-foreground">
              {isSelected && !sessionId
                ? "No session id for this visitor."
                : isSelected
                  ? null
                  : "Select to watch live view"}
            </div>
          )}
        </div>

        <div className="space-y-1.5 border-t border-border/60 px-3 py-2.5 text-[11px] leading-relaxed">
          <div className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1">
            <span className="text-muted-foreground">Path</span>
            <span className="min-w-0 truncate font-medium text-foreground" title={visitor.currentUrl}>
              {pathLabel(visitor.currentUrl)}
            </span>
            {visitor.title ? (
              <>
                <span className="text-muted-foreground">Title</span>
                <span className="line-clamp-2 min-w-0 text-foreground">{visitor.title}</span>
              </>
            ) : null}
            {visitor.email ? (
              <>
                <span className="text-muted-foreground">Email</span>
                <span className="truncate">{visitor.email}</span>
              </>
            ) : null}
            {visitor.userAgent ? (
              <>
                <span className="text-muted-foreground">Device</span>
                <span className="line-clamp-2 break-all opacity-90">{visitor.userAgent}</span>
              </>
            ) : null}
            <span className="text-muted-foreground">Pages</span>
            <span className="tabular-nums">{visitor.pageCount ?? pageTrail.length}</span>
          </div>
        </div>
      </div>

      {pageTrail.length > 0 ? (
        <Collapsible open={urlsOpen} onOpenChange={setUrlsOpen} className="border-t border-border/60">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-full justify-between rounded-none px-3 text-xs font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              Page trail ({pageTrail.length})
              <ChevronDown className={cn("size-4 shrink-0 transition-transform", urlsOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 px-3 pb-3">
            <ol className="max-h-44 list-decimal space-y-1.5 overflow-y-auto pl-4 text-[11px] text-muted-foreground">
              {pageTrail.map((u, i) => (
                <li key={`${u}-${i}`} className="break-all">
                  <a
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    className="text-fuchsia-700 underline-offset-2 hover:underline dark:text-fuchsia-400"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {pathLabel(u)}
                  </a>
                </li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {visitor.conversationId ? (
        <div className="border-t border-border/60 px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <Link
            href={`/conversations/${visitor.conversationId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-fuchsia-600 hover:underline dark:text-fuchsia-400"
          >
            <MessageCircle className="size-3.5" />
            Open conversation
          </Link>
        </div>
      ) : null}
    </div>
  );
}
