// apps/web/modules/dashboard/ui/components/live-visitor-view.tsx
"use client";

import { useRef, useEffect } from "react";
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
  sessionId: string; // contactSession._id casté en string dans ContactPanel
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 1) Dernier snapshot pour cette session
  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId: sessionId as unknown as Id<"contactSessions">,
      limit: 1,
    }) ?? [];

  const latest = snaps[0];

  // 2) On instancie un Replayer *statique* dès qu'on a un snapshot
  useEffect(() => {
    if (!containerRef.current) return;
    if (!latest?.snapshot) return;

    try {
      const events = JSON.parse(latest.snapshot) as eventWithTime[];

      console.log("[live] init Replayer from snapshot", {
        count: events.length,
      });

      // On nettoie le container
      containerRef.current.innerHTML = "";

      const replayer = new Replayer(events, {
        root: containerRef.current,
      });

      // Comme dans l’exemple Medium : on lance le replay
      replayer.play();

      return () => {
        replayer.pause();
        replayer.destroy();
      };
    } catch (err) {
      console.error("[live] failed to init Replayer from snapshot", err);
    }
  }, [latest?.snapshot]);

  // 3) Flux live Pusher juste pour le curseur
  const { cursor } = useVisitorStream({
    orgId,
    sessionId,
  });

  return (
    <div
      className="relative rounded-xl border overflow-hidden bg-black/5"
      style={{ height: 360 }}
    >
      {/* Zone où rrweb reconstruit la page */}
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden"
      />

      {/* Curseur live au-dessus */}
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
