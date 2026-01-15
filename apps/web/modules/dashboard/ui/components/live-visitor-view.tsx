// apps/web/modules/dashboard/ui/components/live-visitor-view.tsx
"use client";

import { useRef, useEffect, useCallback } from "react";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "rrweb/typings/types";
import { Replayer } from "rrweb";
import "rrweb-player/dist/style.css";

export function LiveVisitorView({
  orgId,
  sessionId,
}: {
  orgId: string;
  sessionId: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const replayerRef = useRef<Replayer | null>(null);

  const queueRef = useRef<eventWithTime[]>([]);
  const rafRef = useRef<number>(0);
  const processingRef = useRef(false);

  const MAX_QUEUE = 5_000;
  const MAX_PER_FRAME = 120;

  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId: sessionId as unknown as Id<"contactSessions">,
      limit: 1,
    }) ?? [];

  const latest = snaps[0];

  const applyScale = useCallback(() => {
    const root = containerRef.current;
    if (!root) return false;

    // rrweb-player root structure: first child exists, but sometimes size is 0 for a tick
    const content = root.firstElementChild as HTMLElement | null;
    if (!content) return false;

    const rootRect = root.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();

    if (!rootRect.width || !rootRect.height) return false;
    if (!contentRect.width || !contentRect.height) return false;

    const scale = Math.min(
      rootRect.width / contentRect.width,
      rootRect.height / contentRect.height,
      1,
    );

    content.style.transformOrigin = "top left";
    content.style.transform = `scale(${scale})`;

    return true;
  }, []);

  // ✅ retry scale a few times until rrweb has layout
  const ensureScaled = useCallback(() => {
    let tries = 0;
    const maxTries = 20;

    const tick = () => {
      tries++;
      const ok = applyScale();
      if (ok) return;
      if (tries < maxTries) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [applyScale]);

  const destroyReplayer = useCallback(() => {
    try {
      replayerRef.current?.pause();
    } catch {}
    replayerRef.current = null;

    queueRef.current = [];
    processingRef.current = false;

    try {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } catch {}
    rafRef.current = 0;

    if (containerRef.current) containerRef.current.innerHTML = "";
  }, []);

  const bootFromEvents = useCallback(
    (events: eventWithTime[]) => {
      if (!containerRef.current) return;

      destroyReplayer();
      containerRef.current.innerHTML = "";

      try {
        const replayer = new Replayer(events, {
          root: containerRef.current,
          // ⚠️ IMPORTANT: rrweb-player needs to control sizing; we scale after
        });
        replayerRef.current = replayer;
        replayer.play();
      } catch {
        replayerRef.current = null;
      }

      // ✅ scale after layout stabilizes
      ensureScaled();
    },
    [destroyReplayer, ensureScaled],
  );

  useEffect(() => {
    if (!latest?.snapshot) return;

    try {
      const events = JSON.parse(latest.snapshot) as eventWithTime[];
      bootFromEvents(events);

      const onResize = () => ensureScaled();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    } catch (err) {
      console.error("[live] failed to init snapshot", err);
    }
  }, [latest?.snapshot, bootFromEvents, ensureScaled]);

  const processQueue = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;

    const tick = () => {
      rafRef.current = 0;
      const r = replayerRef.current;
      if (!r) {
        processingRef.current = false;
        queueRef.current = [];
        return;
      }

      let count = 0;
      while (queueRef.current.length && count < MAX_PER_FRAME) {
        const e = queueRef.current.shift()!;
        try {
          if ((e as any)?.type === 2) continue; // ignore full snapshot here
          r.addEvent(e);
        } catch {}
        count++;
      }

      if (queueRef.current.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        processingRef.current = false;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const onRrweb = useCallback(
    (events: eventWithTime[]) => {
      if (!replayerRef.current) return;

      if (queueRef.current.length > MAX_QUEUE) {
        queueRef.current.splice(
          0,
          queueRef.current.length - Math.floor(MAX_QUEUE / 2),
        );
      }

      queueRef.current.push(...events);
      processQueue();

      // ✅ keep scale correct in case DOM grows
      ensureScaled();
    },
    [processQueue, ensureScaled],
  );

  const onSnapshot = useCallback(
    (events: eventWithTime[]) => {
      if (events.length === 1 && (events[0] as any)?.type === 4) return;
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
