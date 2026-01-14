// apps/web/modules/dashboard/ui/components/live-visitor-view.tsx
"use client";

import { useRef, useEffect, useCallback } from "react";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "@rrweb/types";
import { Replayer } from "rrweb";
import "rrweb/dist/rrweb.css";

export function LiveVisitorView({
  orgId,
  sessionId,
}: {
  orgId: string;
  sessionId: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const replayerRef = useRef<Replayer | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId: sessionId as unknown as Id<"contactSessions">,
      limit: 1,
    }) ?? [];

  const latest = snaps[0];

  const applyScale = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;

    const content = root.firstElementChild as HTMLElement | null;
    if (!content) return;

    // ✅ natural size (unaffected by transform)
    const naturalW = content.scrollWidth || content.offsetWidth;
    const naturalH = content.scrollHeight || content.offsetHeight;
    if (!naturalW || !naturalH) return;

    const rootRect = root.getBoundingClientRect();
    const scale = Math.min(rootRect.width / naturalW, rootRect.height / naturalH, 1);

    content.style.transformOrigin = "top left";
    content.style.transform = `scale(${scale})`;
  }, []);

  const bootFromEvents = useCallback(
    (events: eventWithTime[]) => {
      if (!containerRef.current) return;

      try {
        replayerRef.current?.pause();
        replayerRef.current?.destroy();
      } catch {}
      replayerRef.current = null;

      containerRef.current.innerHTML = "";

      const replayer = new Replayer(events, {
        root: containerRef.current,
        // You can add: UNSAFE_replayCanvas: false, if needed for perf
      });
      replayerRef.current = replayer;
      replayer.play();

      requestAnimationFrame(() => applyScale());
    },
    [applyScale],
  );

  // Init depuis snapshot DB
  useEffect(() => {
    if (!latest?.snapshot) return;

    try {
      const events = JSON.parse(latest.snapshot) as eventWithTime[];
      bootFromEvents(events);

      // ✅ resize observer (better than window resize only)
      if (roRef.current) roRef.current.disconnect();
      roRef.current = new ResizeObserver(() => applyScale());
      if (containerRef.current) roRef.current.observe(containerRef.current);

      return () => {
        try {
          roRef.current?.disconnect();
        } catch {}
        roRef.current = null;
      };
    } catch (err) {
      console.error("[live] failed to init snapshot", err);
    }
  }, [latest?.snapshot, bootFromEvents, applyScale]);

  // Live incremental
  const onRrweb = useCallback((events: eventWithTime[]) => {
    const r = replayerRef.current;
    if (!r) return;

    try {
      for (const e of events) {
        if ((e as any)?.type === 2) continue; // full snapshot handled by onSnapshot
        r.addEvent(e);
      }
    } catch (err) {
      console.warn("[live] addEvent failed", err);
    }
  }, []);

  // Full snapshot live => reset replayer
  const onSnapshot = useCallback(
    (events: eventWithTime[]) => {
      bootFromEvents(events);
    },
    [bootFromEvents],
  );

  const { cursor } = useVisitorStream({
    orgId,
    sessionId,
    onRrweb,
    onSnapshot,
  });

  return (
    <div className="relative rounded-xl border overflow-hidden bg-black/5 h-[360px]">
      <div ref={containerRef} className="absolute inset-0 overflow-hidden" />

      {cursor && (
        <div
          className="absolute size-4 rounded-full bg-emerald-500/80 ring-2 ring-white/70 pointer-events-none"
          style={{
            left: `${cursor.x * 100}%`,
            top: `${cursor.y * 100}%`,
            transform: "translate(-50%,-50%)",
          }}
        />
      )}
    </div>
  );
}
