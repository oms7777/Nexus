"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "@rrweb/types";
import { Replayer } from "rrweb";
import "rrweb/dist/rrweb.css";

import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";

function computeScale(root: HTMLElement, content: HTMLElement) {
  const rootRect = root.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();

  if (!contentRect.width || !contentRect.height) return 1;

  return Math.min(
    rootRect.width / contentRect.width,
    rootRect.height / contentRect.height,
    1,
  );
}

export function LiveVisitorView({
  orgId,
  sessionId,
  height = 360,
}: {
  orgId: string;
  sessionId: Id<"contactSessions">;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const replayerRef = useRef<Replayer | null>(null);

  // 1) Latest snapshot for this session
  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId,
      limit: 1,
    }) ?? [];

  const latest = snaps[0];

  // 2) Init a STATIC Replayer whenever we have a snapshot
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // cleanup previous
    try {
      replayerRef.current?.pause();
      replayerRef.current?.destroy();
    } catch {}
    replayerRef.current = null;

    if (!latest?.snapshot) {
      root.innerHTML = "";
      return;
    }

    try {
      const events = JSON.parse(latest.snapshot) as eventWithTime[];

      // clear container
      root.innerHTML = "";

      const replayer = new Replayer(events, {
        root,
        // IMPORTANT: keep it simple & permissive (like your working version)
        // no liveMode here
      });

      replayerRef.current = replayer;
      replayer.play();

      // ✅ Scale content to fit panel
      const applyScale = () => {
        const r = containerRef.current;
        if (!r) return;

        // rrweb injects its content inside root
        const content = r.firstElementChild as HTMLElement | null;
        if (!content) return;

        const scale = computeScale(r, content);
        content.style.transformOrigin = "top left";
        content.style.transform = `scale(${scale})`;
      };

      // Apply scale after layout
      requestAnimationFrame(() => {
        applyScale();
        // apply twice (rrweb can adjust size after first paint)
        requestAnimationFrame(applyScale);
      });

      // Re-apply scale on resize
      const ro = new ResizeObserver(() => applyScale());
      ro.observe(root);

      return () => {
        try {
          ro.disconnect();
        } catch {}
        try {
          replayer.pause();
          replayer.destroy();
        } catch {}
        replayerRef.current = null;
      };
    } catch (err) {
      console.error("[live] failed to init Replayer from snapshot", err);
      root.innerHTML = "";
    }
  }, [latest?.snapshot]);

  // 3) Live stream (cursor only)
  const { cursor } = useVisitorStream({
    orgId,
    sessionId,
  });

  return (
    <div
      className="relative rounded-xl border overflow-hidden bg-black/5"
      style={{ height }}
    >
      <div ref={containerRef} className="absolute inset-0 overflow-hidden" />

      {cursor && (
        <div
          className="absolute size-4 rounded-full bg-emerald-500/80 ring-2 ring-white/70 pointer-events-none z-50"
          style={{
            left: `${cursor.x * 100}%`,
            top: `${cursor.y * 100}%`,
            transform: "translate(-50%,-50%)",
          }}
        />
      )}

      {!latest?.snapshot && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Waiting for first snapshot…
        </div>
      )}
    </div>
  );
}
