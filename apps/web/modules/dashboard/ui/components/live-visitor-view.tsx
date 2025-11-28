// apps/web/modules/dashboard/ui/components/live-visitor-view.tsx
"use client";

import { useRef, useEffect, useState } from "react";
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
  const [replayer, setReplayer] = useState<Replayer | null>(null);

  // 1) Dès que le ref est monté, on le met dans le state
  useEffect(() => {
    if (containerRef.current) {
      setContainerEl(containerRef.current);
    }
  }, []);

  // 2) On récupère le DERNIER snapshot de cette session
  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId: sessionId as unknown as Id<"contactSessions">,
      limit: 1,
    }) ?? [];

  const latest = snaps[0];

  // 3) On initialise le Replayer quand on a le container + snapshot
  useEffect(() => {
    if (!containerEl || !latest?.snapshot) return;

    try {
      const events = JSON.parse(latest.snapshot) as eventWithTime[];

      // On nettoie un éventuel ancien replayer
      if (replayer) {
        replayer.pause();
      }

      const rep = new Replayer(events, {
        root: containerEl,
        liveMode: true,
      });

      rep.startLive();
      setReplayer(rep);
    } catch (err) {
      console.error("[live] failed to init Replayer from snapshot", err);
    }
  }, [containerEl, latest?.snapshot]);

  // 4) On branche le flux live Pusher (qui alimentera rep.addEvent)
  const { cursor } = useVisitorStream({
    orgId,
    sessionId,
    container: containerEl,
    replayer,
  });

  return (
    <div className="relative rounded-xl border overflow-hidden" style={{ height: 360 }}>
      <div ref={containerRef} className="absolute inset-0 bg-black/5" />
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
