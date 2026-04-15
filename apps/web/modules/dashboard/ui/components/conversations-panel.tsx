"use client"

import { useInfiniteScroll } from "@workspace/ui/hooks/use-infinite-scroll"
import { InfiniteScrollTrigger } from "@workspace/ui/components/infinite-scroll-trigger"

import { getCountryFlagUrl, resolveVisitorCountry } from "@/lib/country-utils"
import { api } from "@workspace/backend/_generated/api"
import { ConversationStatusIcon } from "@workspace/ui/components/conversation-status-icon"
import { DicebearAvatar } from "@workspace/ui/components/dicebear-avatar"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"
import { usePaginatedQuery } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import { useAtomValue, useSetAtom } from "jotai/react"
import { ArrowRightIcon, ArrowUpIcon, CheckIcon, CornerUpLeftIcon, ListIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { statusFilterAtom } from "../../atoms"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Input } from "@workspace/ui/components/input"
import { useMemo, useState } from "react"



function shortId(id: string, len = 4) {
    const s = String(id || "");
    return s.length <= len ? s : s.slice(-len).toUpperCase();
}

function getConversationDisplayName(conversation: any): string {
    const cs = conversation?.contactSession ?? {};
    const name = typeof cs?.name === "string" ? cs.name.trim() : "";
    const email = typeof cs?.email === "string" ? cs.email.trim() : "";
    const company = typeof cs?.metadata?.company === "string" ? cs.metadata.company.trim() : "";
    const role = typeof cs?.metadata?.role === "string" ? cs.metadata.role.trim() : "";

    if (name && name.toLowerCase() !== "visitor") return name;
    if (email) return email;
    if (company) return role ? `${company} • ${role}` : company;
    return `New visitor #${shortId(cs?._id ?? conversation?._id ?? "")}`;
}

function isHotLead(conversation: any): boolean {
    if (conversation?.status === "escalated") return true;
    const t = String(conversation?.lastMessage?.text ?? "").toLowerCase();
    return /(pricing|price|demo|book|booking|meeting|buy|quote|rendez-vous|devis|prix|tarif)/i.test(t);
}

function isUnseenEscalation(conversation: any): boolean {
    // Deterministic & safe: highlight escalations that were never viewed yet.
    return conversation?.status === "escalated" && (conversation?.lastViewedByRepAt == null);
}

function safePageLabelFromUrl(raw: unknown): string | undefined {
    const href = typeof raw === "string" ? raw.trim() : "";
    if (!href) return undefined;
    try {
        const u = new URL(href);
        const host = u.hostname.replace(/^www\./i, "");
        const path = u.pathname === "/" ? "" : u.pathname;
        const s = `${host}${path}`;
        return s.length > 60 ? `${s.slice(0, 59)}…` : s;
    } catch {
        // file:// or invalid URL
        if (href.startsWith("file://")) return "Local file";
        return href.length > 60 ? `${href.slice(0, 59)}…` : href;
    }
}

export const ConversationsPanel = () => {
    const pathname = usePathname();

    const statusFilter = useAtomValue(statusFilterAtom);
    const setStatusFilter = useSetAtom(statusFilterAtom);


    const conversations = usePaginatedQuery(
        api.private.conversations.getMany,
        {
            status: statusFilter === "all" || statusFilter === "active" ? undefined : statusFilter,
            statusIn: statusFilter === "active" ? ["unresolved", "escalated"] : undefined,
        },
        {
            initialNumItems: 10,
        }
    )

    const {
        topElementRef,
        handleLoadMore,
        canLoadMore,
        isLoadingMore,
        isLoadingFirstPage,
    } = useInfiniteScroll({
        status: conversations.status,
        loadMore: conversations.loadMore,
        loadSize: 10,
    });

    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return conversations.results;
        return conversations.results.filter((c: any) => {
            const name = getConversationDisplayName(c).toLowerCase();
            const last = String(c?.lastMessage?.text ?? "").toLowerCase();
            const url = String(c?.contactSession?.metadata?.currentUrl ?? "").toLowerCase();
            return name.includes(q) || last.includes(q) || url.includes(q);
        });
    }, [conversations.results, query]);


    return (
        <div className="flex h-full w-full flex-col bg-background text-sidebar-foreground">
            <div className="flex flex-col gap-2 border-b p-3">
                <Select
                    defaultValue="active"
                    onValueChange={(value) => setStatusFilter(
                        value as "unresolved" | "escalated" | "resolved" | "all" | "active"
                    )}
                    value={statusFilter}
                >
                    <SelectTrigger
                        className="h-8 border-none px-1.5 shadow-none ring-0 hover:bg-accent hover:text-accent-foreground focus-visible:ring-0"
                    >
                        <SelectValue placeholder="Filter"/>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="active">
                            <div className="flex items-center gap-2">
                                <ListIcon className="size-4"/>
                                <span>Active</span>
                            </div>
                        </SelectItem>
                        <SelectItem value="all">
                            <div className="flex items-center gap-2">
                                <ListIcon className="size-4"/>
                                <span>All</span>
                            </div>
                        </SelectItem>
                        <SelectItem value="unresolved">
                            <div className="flex items-center gap-2">
                                <ArrowRightIcon className="size-4"/>
                                <span>Unresolved</span>
                            </div>
                        </SelectItem>
                        <SelectItem value="escalated">
                            <div className="flex items-center gap-2">
                                <ArrowUpIcon className="size-4"/>
                                <span>Escalated</span>
                            </div>
                        </SelectItem>
                        <SelectItem value="resolved">
                            <div className="flex items-center gap-2">
                                <CheckIcon className="size-4"/>
                                <span>Resolved</span>
                            </div>
                        </SelectItem>
                    </SelectContent>
                </Select>
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search…"
                    className="h-9 rounded-xl bg-muted/30"
                />
            </div>
            {isLoadingFirstPage ? (
                <SkeletonConversations />
            ) : (
                <ScrollArea className="max-h-[calc(100vh-86px)]">
                    <div className="flex w-full flex-1 flex-col gap-2 p-2 text-sm">
                        {filtered.map((conversation) => {
                            const isLastMessageFromOperator =
                                conversation.lastMessage?.message?.role !== "user"
                            
                            const country = resolveVisitorCountry(
                                conversation.contactSession.metadata ?? undefined,
                            );

                            const countryFlagUrl = country?.code
                                ? getCountryFlagUrl(country.code)
                                : undefined;

                            const pageLabel = safePageLabelFromUrl(
                                conversation?.contactSession?.metadata?.currentUrl,
                            );
                            const locationLabel = [
                                conversation?.contactSession?.metadata?.city,
                                conversation?.contactSession?.metadata?.countryCode,
                            ]
                                .filter(Boolean)
                                .join(", ");

                            return (
                                <Link 
                                    key={conversation._id}
                                    className={cn(
                                        "group relative flex cursor-pointer items-start gap-3 rounded-2xl border bg-white px-3 py-3 text-sm leading-tight shadow-sm transition-colors hover:bg-muted/40",
                                        pathname === `/conversations/${conversation._id}` &&
                                            "border-slate-200 bg-muted/60"
                                    )}
                                    href={`/conversations/${conversation._id}`}
                                >
                                        <DicebearAvatar 
                                            seed={conversation.contactSession._id}
                                            badgeImageUrl={countryFlagUrl}
                                            size={40}
                                            className="shrink-0"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex w-full items-center gap-2 min-w-0">
                                                <span className="truncate font-bold">
                                                    {getConversationDisplayName(conversation)}
                                                </span>
                                                {isUnseenEscalation(conversation) && (
                                                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                                        New
                                                    </span>
                                                )}
                                                {isHotLead(conversation) && (
                                                    <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                                                        Hot
                                                    </span>
                                                )}
                                                <span className="ml-auto shrink-0 text-muted-foreground text-xs">
                                                    {formatDistanceToNow(conversation._creationTime, { addSuffix: true })}
                                                </span>
                                            </div>
                                            {(pageLabel || locationLabel) && (
                                                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                                    {pageLabel && <span className="truncate">{pageLabel}</span>}
                                                    {pageLabel && locationLabel && <span>•</span>}
                                                    {locationLabel && <span className="truncate">{locationLabel}</span>}
                                                </div>
                                            )}
                                            <div className="mt-1 flex items-center justify-between gap-2">
                                                <div className="flex w-0 grow items-center gap-1">
                                                    {isLastMessageFromOperator && (
                                                        <CornerUpLeftIcon className="size-3 shrink-0 text-muted-foreground"/>
                                                    )}
                                                    <span
                                                        className={cn(
                                                            "line-clamp-1 text-muted-foreground text-xs",
                                                            !isLastMessageFromOperator && "font-bold text-black"
                                                        )}
                                                    >
                                                        {conversation.lastMessage?.text}
                                                    </span>
                                                </div>
                                                {<ConversationStatusIcon status={conversation.status}/>}
                                            </div>
                                        </div>
                                </Link>
                            )
                        })}
                        <InfiniteScrollTrigger 
                            canLoadMore={canLoadMore}
                            isLoadingMore={isLoadingMore}
                            onLoadMore={handleLoadMore}
                            ref={topElementRef}
                        
                        />
                    </div>
                </ScrollArea>
            )}
        </div>
    )
}

export const SkeletonConversations = () => {
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
            <div className="relative flex w-full min-w-0 flex-col p-2">
                <div className="w-full space-y-2">
                    {Array.from({ length: 8 }).map((_, index) => (
                        <div
                            className="flex items-start gap-3 rounded-lg p-4"
                            key={index}
                        >
                            <Skeleton className="h-10 w-10 shrink-0 rounded-full"/>
                            <div className="min-w-0 flex-1">
                                <div className="flex w-full items-center gap-2">
                                    <Skeleton className="h-4 w-24"/>
                                    <Skeleton className="ml-auto h-3 w-12 shrink-0"/>
                                </div>
                                <div className="mt-2">
                                    <Skeleton className="h-3 w-full"/>
                                </div>
                            </div>

                        </div>
                    ))}
                </div>
            </div>

        </div>
    )
}