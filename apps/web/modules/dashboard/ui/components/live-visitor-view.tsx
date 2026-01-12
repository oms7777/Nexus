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

  // 1) Dernier snapshot pour cette session
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

  // 2) Init Replayer depuis snapshot (une seule fois par snapshot)
  useEffect(() => {
    if (!containerRef.current) return;
    if (!latest?.snapshot) return;

    try {
      const events = JSON.parse(latest.snapshot) as eventWithTime[];

      // clear UI
      containerRef.current.innerHTML = "";

      const replayer = new Replayer(events, {
        root: containerRef.current,
        liveMode: true,
      });

      replayerRef.current = replayer;

      // on “play” pour que le DOM soit construit
      replayer.play();

      // scale
      setTimeout(applyScale, 0);

      return () => {
        try {
          replayer.pause();
          replayer.destroy();
        } catch {}
        replayerRef.current = null;
      };
    } catch {
      // ignore
    }
  }, [latest?.snapshot, applyScale]);

  // 3) Live stream: curseur + rrweb events
  const { cursor } = useVisitorStream({
    orgId,
    sessionId,
    onRrwebEvents: (events) => {
      const r = replayerRef.current as any;
      if (!r) return;

      // ✅ MAJ: push live events into rrweb
      for (const e of events) {
        try {
          r.addEvent(e);
        } catch {
          // ignore
        }
      }

      // optional rescale (light)
      requestAnimationFrame(() => applyScale());
    },
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
