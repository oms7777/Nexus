// apps/web/modules/dashboard/ui/components/live-visitor-view.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "@rrweb/types";
import { Replayer } from "rrweb";
import "rrweb/dist/rrweb.css";

import Pusher from "pusher-js";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";

function computeScale(root: HTMLElement, content: HTMLElement) {
  const rootRect = root.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  if (!contentRect.width || !contentRect.height) return 1;

  return Math.min(
    rootRect.width / contentRect.width,
    rootRect.height / contentRect.height,
    1
  );
}

type PageSignal = { href?: string; title?: string; ts?: number };

export function LiveVisitorView({
  orgId,
  sessionId,
  height = 360,
}: {
  orgId: string;
  sessionId: Id<"contactSessions">;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const replayerRef = useRef<Replayer | null>(null);

  const [page, setPage] = useState<PageSignal | null>(null);

  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId,
      limit: 1,
    }) ?? [];

  const latest = snaps[0];

  // --- listen to client-page (live URL updates) ---
  useEffect(() => {
    if (!orgId || !sessionId) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      forceTLS: true,
      enabledTransports: ["ws", "wss"],
      disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],
      authEndpoint: "https://app.inboundless.co/api/realtime/pusher-auth",
    });

    const channelName = `presence-org_${orgId}_session_${sessionId}`;
    const channel = pusher.subscribe(channelName);

    const onPage = (payload: PageSignal) => {
      if (!payload) return;
      setPage(payload);
    };

    channel.bind("client-page", onPage);

    return () => {
      try {
        channel.unbind("client-page", onPage);
        channel.unbind_all();
      } catch {}
      pusher.disconnect();
    };
  }, [orgId, sessionId]);

  const pageLabel = useMemo(() => {
    // Prefer live page signal, fallback to snapshot metadata
    const href = page?.href || latest?.pageUrl;
    const title = page?.title || latest?.title;

    if (!href && !title) return null;

    return {
      href: href || "",
      title: title || "",
    };
  }, [page, latest?.pageUrl, latest?.title]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    try {
      replayerRef.current?.pause();
      replayerRef.current?.destroy();
    } catch {}
    replayerRef.current = null;

    if (!latest?.snapshot) {
      root.innerHTML = "";
      return;
    }

    let ro: ResizeObserver | null = null;
    let destroyed = false;

    try {
      const events = JSON.parse(latest.snapshot) as eventWithTime[];

      root.innerHTML = "";

      const replayer = new Replayer(events, { root });
      replayerRef.current = replayer;

      const applyScaleWhenReady = (tries = 0) => {
        if (destroyed) return;
        const r = containerRef.current;
        if (!r) return;

        const content =
          (r.querySelector(".rrweb-replayer-wrapper") as HTMLElement | null) ||
          (r.querySelector(".replayer-wrapper") as HTMLElement | null) ||
          (r.firstElementChild as HTMLElement | null);

        if (!content) {
          if (tries < 30) requestAnimationFrame(() => applyScaleWhenReady(tries + 1));
          return;
        }

        const rect = content.getBoundingClientRect();
        if ((!rect.width || !rect.height) && tries < 30) {
          requestAnimationFrame(() => applyScaleWhenReady(tries + 1));
          return;
        }

        const scale = computeScale(r, content);
        content.style.transformOrigin = "top left";
        content.style.transform = `scale(${scale})`;
      };

      try {
        (replayer as any).play?.(0);
      } catch {
        replayer.play();
      }

      applyScaleWhenReady();

      ro = new ResizeObserver(() => applyScaleWhenReady());
      ro.observe(root);

      return () => {
        destroyed = true;
        try {
          ro?.disconnect();
        } catch {}
        try {
          replayer.pause();
          replayer.destroy();
        } catch {}
        replayerRef.current = null;
      };
    } catch (err) {
      console.error("[live] failed to init Replayer from snapshot", err);
      root.innerHTML = "";
      return () => {
        destroyed = true;
        try {
          ro?.disconnect();
        } catch {}
      };
    }
  }, [latest?.snapshot]);

  const { cursor } = useVisitorStream({ orgId, sessionId });

  return (
    <div className="relative rounded-xl border overflow-hidden bg-black/5" style={{ height }}>
      <div ref={containerRef} className="absolute inset-0 overflow-hidden" />

      {/* ✅ show live URL/title */}
      {pageLabel && (
        <div className="absolute left-2 top-2 z-50 rounded-md bg-white/80 px-2 py-1 text-[11px] text-slate-700 backdrop-blur">
          <div className="font-medium truncate max-w-[320px]">{pageLabel.title || "Page"}</div>
          {pageLabel.href && (
            <div className="truncate max-w-[320px] opacity-80">{pageLabel.href}</div>
          )}
        </div>
      )}

      {cursor && (
        <div
          className="absolute size-4 rounded-full bg-emerald-500/80 ring-2 ring-white/70 pointer-events-none z-50"
          style={{
            left: `${cursor.x * 100}%`,
            top: `${cursor.y * 100}%`,
            transform: "translate(-50%,-50%)",
          }}
        />
      )}

      {!latest?.snapshot && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Waiting for first snapshot…
        </div>
      )}
    </div>
  );
}
