"use client";

import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import { useMemo } from "react";

function getHost(url?: string) {
  try {
    if (!url) return "";
    return new URL(url).host;
  } catch {
    return "";
  }
}

function safeParseSnapshot(snapshot?: string): any | null {
  if (!snapshot) return null;
  try {
    const obj = JSON.parse(snapshot);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

export function LiveVisitorView({
  sessionId,
  height = 360,
}: {
  sessionId: Id<"contactSessions">;
  height?: number;
}) {
  const snaps =
    useQuery(api.public.snapshots.listRecent, { sessionId, limit: 1 }) ?? [];

  const latest = snaps[0];

  const meta = useMemo(() => safeParseSnapshot(latest?.snapshot), [latest?.snapshot]);

  // ✅ fallback: champ direct OU snapshot JSON V1
  const pageUrl: string | undefined = latest?.pageUrl ?? meta?.pageUrl;
  const title: string | undefined = latest?.title ?? meta?.title;
  const host = getHost(pageUrl);

  const favicon = host
    ? `https://www.google.com/s2/favicons?domain=${host}&sz=64`
    : null;

  const isLoading = snaps === undefined; // useQuery renvoie souvent undefined avant la data

  return (
    <div
      className="relative rounded-xl border overflow-hidden bg-black/5"
      style={{ height }}
    >
      {isLoading ? (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : !pageUrl ? (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          No page yet
        </div>
      ) : (
        <div className="h-full w-full p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {favicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={favicon} alt="" className="h-5 w-5 rounded" />
            ) : (
              <div className="h-5 w-5 rounded bg-muted" />
            )}

            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {title || "Current page"}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {pageUrl}
              </div>
            </div>
          </div>

          <div className="flex-1 rounded-lg bg-white/60 border border-dashed grid place-items-center text-xs text-muted-foreground">
            Screenshot coming soon (V1)
          </div>
        </div>
      )}
    </div>
  );
}
