"use client";

import { useEffect, useRef } from "react";
import { Replayer } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

export function LiveVisitorView({ orgId, sessionId }: any) {
  const containerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | null>(null);

  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId,
      limit: 1,
    }) ?? [];

  const convexSnapshot = snaps[0];

  const { cursor, snapshotEvents } = useVisitorStream({ orgId, sessionId });

  // ✅ SOURCE DES EVENTS : CONVEX SI DISPO, SINON PUSHER DIRECT
  const eventsFromConvex: eventWithTime[] | null = convexSnapshot?.snapshot
    ? (JSON.parse(convexSnapshot.snapshot) as eventWithTime[])
    : null;

  const events = eventsFromConvex ?? snapshotEvents;

  useEffect(() => {
    if (!containerRef.current || !events?.length) return;

    containerRef.current.innerHTML = "";

    replayerRef.current?.destroy();
    replayerRef.current = new Replayer(events, {
      root: containerRef.current,
      liveMode: false,
    });

    replayerRef.current.play();

    return () => {
      replayerRef.current?.destroy();
      replayerRef.current = null;
    };
  }, [events]);

  return (
    <div className="relative h-[360px] border rounded overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {cursor && (
        <div
          className="absolute w-3 h-3 bg-emerald-500 rounded-full pointer-events-none"
          style={{
            left: `${cursor.x * 100}%`,
            top: `${cursor.y * 100}%`,
            transform: "translate(-50%,-50%)",
          }}
        />
      )}

      {!events?.length && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Waiting for first snapshot…
        </div>
      )}
    </div>
  );
}
