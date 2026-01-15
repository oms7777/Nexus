"use client";

import { useRef, useEffect, useCallback } from "react";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "rrweb/typings/types";
import { Replayer } from "rrweb";

export function LiveVisitorView({
  orgId,
  sessionId,
}: {
  orgId: string;
  sessionId: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const replayerRef = useRef<Replayer | null>(null);

  // queue processing (anti-freeze)
  const queueRef = useRef<eventWithTime[]>([]);
  const rafRef = useRef<number>(0);
  const processingRef = useRef(false);

  // safety bounds
  const MAX_QUEUE = 5_000; // si ça dépasse, on drop
  const MAX_PER_FRAME = 120; // events traités par frame max

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

  const destroyReplayer = useCallback(() => {
    try {
      replayerRef.current?.pause();
      // rrweb v1.1.3: pas toujours de destroy()
      // on force juste le detach visuel
    } catch {}
    replayerRef.current = null;

    // reset queue
    queueRef.current = [];
    processingRef.current = false;

    try {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } catch {}
    rafRef.current = 0;

    // clean DOM root (le plus important)
    if (containerRef.current) containerRef.current.innerHTML = "";
  }, []);


  const bootFromEvents = useCallback(
    (events: eventWithTime[]) => {
      if (!containerRef.current) return;

      destroyReplayer();

      // reset container
      containerRef.current.innerHTML = "";

      // IMPORTANT: rrweb peut throw si snapshot meta-only => on try/catch
      try {
        const replayer = new Replayer(events, { root: containerRef.current });
        replayerRef.current = replayer;
        replayer.play();
      } catch (e) {
        // si c’est un “snapshot meta-only”, on ignore
        replayerRef.current = null;
      }

      requestAnimationFrame(() => applyScale());
    },
    [applyScale, destroyReplayer],
  );

  // Init depuis snapshot DB
  useEffect(() => {
    if (!latest?.snapshot) return;

    try {
      const events = JSON.parse(latest.snapshot) as eventWithTime[];
      bootFromEvents(events);

      const onResize = () => applyScale();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    } catch (err) {
      console.error("[live] failed to init snapshot", err);
    }
  }, [latest?.snapshot, bootFromEvents, applyScale]);

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
          // ignore full snapshot in incremental stream
          if ((e as any)?.type === 2) continue;
          r.addEvent(e);
        } catch {
          // best effort
        }
        count++;
      }

      // continue next frame if still backlog
      if (queueRef.current.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        processingRef.current = false;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Live incremental (push in queue)
  const onRrweb = useCallback(
    (events: eventWithTime[]) => {
      if (!replayerRef.current) return;

      // drop strategy
      if (queueRef.current.length > MAX_QUEUE) {
        queueRef.current.splice(0, queueRef.current.length - Math.floor(MAX_QUEUE / 2));
      }

      queueRef.current.push(...events);
      processQueue();
    },
    [processQueue],
  );

  // Snapshot live => reboot
  const onSnapshot = useCallback(
    (events: eventWithTime[]) => {
      // si c’est meta-only (1 event type 4), on ne reboot pas le replayer
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
    <div className="relative rounded-xl border overflow-hidden bg-black/5" style={{ height: 360 }}>
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
