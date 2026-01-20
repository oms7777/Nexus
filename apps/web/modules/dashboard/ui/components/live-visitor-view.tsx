"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";

function safeOrigin(u?: string) {
  if (!u) return null;
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
}

function safeHost(u?: string) {
  if (!u) return "—";
  try {
    return new URL(u).host;
  } catch {
    return "—";
  }
}

function safePath(u?: string) {
  if (!u) return "—";
  try {
    const url = new URL(u);
    return url.pathname + (url.search ? url.search : "");
  } catch {
    return u;
  }
}

export function LiveVisitorView({
  sessionId,
  height = 360,
}: {
  sessionId: string;
  height?: number;
}) {
  // latest snapshots (V1 => snapshot contient {pageUrl,title,width,height,ts})
  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId: sessionId as unknown as Id<"contactSessions">,
      limit: 12,
    }) ?? [];

  const latest = snaps[0];

  const currentUrl = latest?.pageUrl || "";
  const currentTitle = latest?.title || "";

  // List pages (unique, latest first) from snapshots
  const pages = useMemo(() => {
    const seen = new Set<string>();
    const out: { url: string; title?: string; ts?: number }[] = [];

    for (const s of snaps) {
      const url = (s as any)?.pageUrl as string | undefined;
      if (!url) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ url, title: (s as any)?.title, ts: (s as any)?.ts });
    }
    return out;
  }, [snaps]);

  const canEmbed = !!safeOrigin(currentUrl); // basic guard

  return (
    <div className="space-y-3">
      {/* Viewer */}
      <div className="rounded-xl border overflow-hidden bg-background">
        <div className="px-3 py-2 border-b flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {currentTitle || safeHost(currentUrl)}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {safePath(currentUrl)}
            </div>
          </div>

          {currentUrl ? (
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline text-muted-foreground shrink-0"
              title={currentUrl}
            >
              Open
            </a>
          ) : null}
        </div>

        <div style={{ height }} className="bg-black/5">
          {!currentUrl ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No page yet
            </div>
          ) : !canEmbed ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
              This page can’t be embedded (X-Frame-Options / CSP). Use “Open”.
            </div>
          ) : (
            <iframe
              key={currentUrl} // force refresh when url changes
              src={currentUrl}
              className="w-full h-full"
              style={{ border: "none" }}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer-when-downgrade"
              loading="lazy"
              title="Live page"
            />
          )}
        </div>
      </div>

      {/* Pages visited */}
      <div className="rounded-xl border bg-background">
        <div className="px-3 py-2 border-b">
          <div className="text-sm font-medium">Pages visited</div>
          <div className="text-xs text-muted-foreground">
            Latest first
          </div>
        </div>

        {!pages.length ? (
          <div className="p-3 text-sm text-muted-foreground">No pages yet</div>
        ) : (
          <div className="max-h-[220px] overflow-auto divide-y">
            {pages.map((p) => (
              <div key={p.url} className="p-3">
                <div className="text-sm font-medium truncate">
                  {p.title || safeHost(p.url)}
                </div>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground underline truncate block"
                  title={p.url}
                >
                  {p.url}
                </a>
                {p.ts ? (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {new Date(p.ts).toLocaleString()}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
