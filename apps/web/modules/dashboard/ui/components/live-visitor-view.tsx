"use client";

import { useEffect, useRef } from "react";
import { Replayer } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import "rrweb/dist/rrweb.css";

export function LiveVisitorView({
  orgId,
  sessionId,
  height = 360,
}: {
  orgId: string;
  sessionId: Id<"contactSessions">;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | null>(null);

  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId,
      limit: 1,
    }) ?? [];

  const snapshot = snaps[0];

  useEffect(() => {
    if (!containerRef.current) return;

    // cleanup previous
    try {
      replayerRef.current?.destroy();
    } catch {}
    replayerRef.current = null;

    if (!snapshot?.snapshot) {
      containerRef.current.innerHTML = "";
      return;
    }

    const events = JSON.parse(snapshot.snapshot) as eventWithTime[];
    containerRef.current.innerHTML = "";

    replayerRef.current = new Replayer(events, {
      root: containerRef.current,
      liveMode: true,
    });

    replayerRef.current.play();

    return () => {
      try {
        replayerRef.current?.destroy();
      } catch {}
      replayerRef.current = null;
    };
  }, [snapshot?.snapshot]);

  const { cursor } = useVisitorStream({ orgId, sessionId });

  return (
    <div className="relative rounded-xl border overflow-hidden" style={{ height }}>
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

      {!snapshot?.snapshot && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Waiting for first snapshot…
        </div>
      )}
    </div>
  );
}
