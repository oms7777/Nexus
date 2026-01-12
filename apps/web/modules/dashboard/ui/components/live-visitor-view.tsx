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

  // 1) Dernier snapshot
  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId: sessionId as unknown as Id<"contactSessions">,
      limit: 1,
    }) ?? [];

  const latest = snaps[0];

  const applyScale = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;

    // rrweb met son contenu dans le premier enfant du root
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

  // 2) Init Replayer depuis snapshot
  useEffect(() => {
    if (!containerRef.current) return;
    if (!latest?.snapshot) return;

    try {
      const events = JSON.parse(latest.snapshot) as eventWithTime[];

      console.log("[live] init Replayer from snapshot", { count: events.length });

      // cleanup replayer précédent
      try {
        replayerRef.current?.pause();
        replayerRef.current?.destroy();
      } catch {}
      replayerRef.current = null;

      // reset container
      containerRef.current.innerHTML = "";

      const replayer = new Replayer(events, {
        root: containerRef.current,
      });

      replayerRef.current = replayer;

      replayer.play();

      // scale après paint
      requestAnimationFrame(() => {
        applyScale();
      });

      const onResize = () => applyScale();
      window.addEventListener("resize", onResize);

      return () => {
        window.removeEventListener("resize", onResize);
        try {
          replayer.pause();
          replayer.destroy();
        } catch {}
        replayerRef.current = null;
      };
    } catch (err) {
      console.error("[live] failed to init Replayer from snapshot", err);
    }
  }, [latest?.snapshot, applyScale]);

  // 3) Flux live rrweb + curseur via Pusher (hook)
  const onRrweb = useCallback((events: eventWithTime[]) => {
    const r = replayerRef.current;
    if (!r) return;

    try {
      for (const e of events) {
        // on ne rejoue jamais un FullSnapshot ici
        if ((e as any)?.type === 2) continue;
        r.addEvent(e);
      }
    } catch (err) {
      console.warn("[live] addEvent failed", err);
    }
  }, []);

  const { cursor } = useVisitorStream({
    orgId,
    sessionId,
    onRrweb,
  });

  return (
    <div
      className="relative rounded-xl border overflow-hidden bg-black/5"
      style={{ height: 360 }}
    >
      {/* Zone rrweb */}
      <div ref={containerRef} className="absolute inset-0 overflow-hidden" />

      {/* Curseur live */}
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
