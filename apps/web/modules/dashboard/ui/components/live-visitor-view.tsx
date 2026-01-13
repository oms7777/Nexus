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

  const snapshot = snaps[0];

  useEffect(() => {
    if (!containerRef.current || !snapshot?.snapshot) return;

    const events = JSON.parse(snapshot.snapshot) as eventWithTime[];

    containerRef.current.innerHTML = "";

    replayerRef.current = new Replayer(events, {
      root: containerRef.current,
      liveMode: false,
    });

    replayerRef.current.play();

    return () => {
      replayerRef.current?.destroy();
      replayerRef.current = null;
    };
  }, [snapshot?.snapshot]);

  const { cursor } = useVisitorStream({ orgId, sessionId });

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
    </div>
  );
}
