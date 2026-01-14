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

    const rootRect = root.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    if (!contentRect.width || !contentRect.height) return;

    const scale = Math.min(
      rootRect.width / contentRect.width,
      rootRect.height / contentRect.height,
      1,
    );

    content.style.transformOrigin = "top left";
    content.style.transform = `scale(${scale})`;
  }, []);

  const bootFromEvents = useCallback(
    (events: eventWithTime[]) => {
      if (!containerRef.current) return;

      // cleanup old replayer
      try {
        replayerRef.current?.pause();
        replayerRef.current?.destroy();
      } catch {}
      replayerRef.current = null;

      // reset container
      containerRef.current.innerHTML = "";

      const replayer = new Replayer(events, { root: containerRef.current });
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
      console.log("[live] init from db snapshot", { count: events.length });
      bootFromEvents(events);

      const onResize = () => applyScale();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
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
        // si un FullSnapshot arrive ici, ignore (on gère via onSnapshot)
        if ((e as any)?.type === 2) continue;
        r.addEvent(e);
      }
    } catch (err) {
      console.warn("[live] addEvent failed", err);
    }
  }, []);

  // Full snapshot live => reset replayer (ça te donne les “changements de page”)
  const onSnapshot = useCallback(
    (events: eventWithTime[]) => {
      console.log("[live] received snapshot via pusher", { count: events.length });
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
    <div
      className="relative rounded-xl border overflow-hidden bg-black/5"
      style={{ height: 360 }}
    >
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
