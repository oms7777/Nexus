// apps/web/modules/dashboard/ui/components/live-visitor-view.tsx
"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "@rrweb/types";
import { Replayer } from "rrweb";

export function LiveVisitorView({
  orgId,
  sessionId,
}: {
  orgId: string;
  sessionId: string; // contactSession._id casté en string dans ContactPanel
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);
  const replayerRef = useRef<Replayer | null>(null);

  // 1) récupérer le vrai DOM node
  useEffect(() => {
    if (containerRef.current) {
      setContainerEl(containerRef.current);
    }
  }, []);

  // 2) dernier snapshot pour cette session
  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId: sessionId as unknown as Id<"contactSessions">,
      limit: 1,
    }) ?? [];

  const latest = snaps[0];

  // 3) initialiser le Replayer dès qu’on a container + snapshot
  useEffect(() => {
    if (!containerEl || !latest?.snapshot) return;

    try {
      const events = JSON.parse(latest.snapshot) as eventWithTime[];

      console.log("[live] init Replayer from snapshot", {
        count: events.length,
        containerEl,
      });

      // nettoyer replayer précédent si besoin
      if (replayerRef.current) {
        replayerRef.current.pause();
        replayerRef.current = null;
      }

      containerEl.innerHTML = "";

      const rep = new Replayer(events, {
        root: containerEl,
        liveMode: true, // base = snapshot, puis live patches
      });

      rep.startLive();
      replayerRef.current = rep;

      console.log(
        "[live] replayer root children after start",
        containerEl.childNodes,
      );
    } catch (err) {
      console.error("[live] failed to init Replayer from snapshot", err);
    }
  }, [containerEl, latest?.snapshot]);

  // 4) callback stable pour ajouter les events live au Replayer
  const handleEvents = useCallback((events: eventWithTime[]) => {
    if (!replayerRef.current) {
      console.log("[stream] replayer not ready yet, dropping events");
      return;
    }
    events.forEach((ev) => replayerRef.current!.addEvent(ev as any));
  }, []);

  // 5) flux live Pusher (ne démarre que quand container est prêt)
  const { cursor } = useVisitorStream({
    orgId,
    sessionId,
    container: containerEl,
    onEvents: handleEvents,
  });

  return (
    <div className="relative rounded-xl border overflow-hidden" style={{ height: 360 }}>
      {/* rrweb monte DANS ce div */}
      <div ref={containerRef} className="absolute inset-0 bg-black/5" />

      {/* curseur live par dessus */}
      {cursor && (
        <div
          className="absolute size-4 rounded-full bg-emerald-500/80 ring-2 ring-white/70"
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
