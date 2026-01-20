"use client";

import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import { useMemo } from "react";

function safeJson(snapshot?: string): any | null {
  if (!snapshot) return null;
  try {
    const x = JSON.parse(snapshot);
    return x && typeof x === "object" ? x : null;
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
  const meta = useMemo(() => safeJson(latest?.snapshot), [latest?.snapshot]);

  const pageUrl: string | undefined =
    latest?.pageUrl ?? meta?.pageUrl ?? meta?.href; // (au cas où)
  const title: string | undefined =
    latest?.title ?? meta?.title ?? meta?.pageTitle;

  const hasAny = !!latest?.snapshot || !!latest?.pageUrl || !!meta?.pageUrl || !!meta?.href;

  // Thumbnail simple V1 via thum.io
  const thumbUrl = pageUrl
    ? `https://image.thum.io/get/width/1200/${encodeURIComponent(pageUrl)}`
    : null;

  return (
    <div
      className="relative overflow-hidden rounded-xl border bg-black/5"
      style={{ height }}
    >
      {!hasAny ? (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          No page yet
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col">
          <div className="border-b bg-background/80 px-3 py-2 backdrop-blur">
            <div className="truncate text-sm font-medium">
              {title || "Current page"}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {pageUrl || "—"}
            </div>
          </div>

          <div className="relative flex-1 bg-muted">
            {thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbUrl}
                alt="Page preview"
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
                Preview unavailable
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
