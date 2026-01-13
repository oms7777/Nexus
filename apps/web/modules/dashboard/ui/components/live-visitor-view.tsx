// apps/web/modules/dashboard/ui/components/live-visitor-view.tsx
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
    1
  );
}

/**
 * ✅ anti-freeze + ✅ keep META (type 4) that rrweb needs for correct viewport
 * Strategy:
 * - If snapshot is small: keep as-is
 * - If huge: take from last FullSnapshot (type 2), but ALSO include the last Meta (type 4) right before it (if any)
 * - Keep a reasonable tail size to avoid Replayer freeze
 */
function trimSnapshotEvents(events: eventWithTime[]) {
  if (!Array.isArray(events) || events.length <= 1400) return events;

  // find last FullSnapshot (type 2)
  let lastFull = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if ((events[i] as any)?.type === 2) {
      lastFull = i;
      break;
    }
  }

  // if we found a last FullSnapshot, also try to include the nearest Meta (type 4) just before it
  let from = lastFull >= 0 ? lastFull : Math.max(0, events.length - 1200);

  if (lastFull >= 0) {
    let lastMeta = -1;
    for (let i = lastFull - 1; i >= 0; i--) {
      if ((events[i] as any)?.type === 4) {
        lastMeta = i;
        break;
      }
      // small early stop: meta is typically right before full snapshot
      if (lastFull - i > 50) break;
    }
    if (lastMeta >= 0) from = lastMeta;
  }

  const sliced = events.slice(from);
  if (sliced.length > 1200) return sliced.slice(-1200);
  return sliced;
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

  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId,
      limit: 1,
    }) ?? [];

  const latest = snaps[0];

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

    let ro: ResizeObserver | null = null;
    let destroyed = false;

    try {
      const parsed = JSON.parse(latest.snapshot) as eventWithTime[];

      // ✅ ensure rrweb order is stable
      const sorted = Array.isArray(parsed)
        ? [...parsed].sort(
            (a: any, b: any) =>
              (a?.timestamp ?? 0) - (b?.timestamp ?? 0)
          )
        : [];

      const events = trimSnapshotEvents(sorted);

      root.innerHTML = "";

      const replayer = new Replayer(events, { root });
      replayerRef.current = replayer;

      const applyScaleWhenReady = (tries = 0) => {
        if (destroyed) return;
        const r = containerRef.current;
        if (!r) return;

        const content =
          (r.querySelector(".rrweb-replayer-wrapper") as HTMLElement | null) ||
          (r.querySelector(".replayer-wrapper") as HTMLElement | null) ||
          (r.firstElementChild as HTMLElement | null);

        if (!content) {
          if (tries < 40)
            requestAnimationFrame(() => applyScaleWhenReady(tries + 1));
          return;
        }

        const rect = content.getBoundingClientRect();
        if ((!rect.width || !rect.height) && tries < 40) {
          requestAnimationFrame(() => applyScaleWhenReady(tries + 1));
          return;
        }

        const scale = computeScale(r, content);
        content.style.transformOrigin = "top left";
        content.style.transform = `scale(${scale})`;
      };

      // start from beginning
      try {
        (replayer as any).play?.(0);
      } catch {
        replayer.play();
      }

      applyScaleWhenReady();

      ro = new ResizeObserver(() => applyScaleWhenReady());
      ro.observe(root);

      return () => {
        destroyed = true;
        try {
          ro?.disconnect();
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
      return () => {
        destroyed = true;
        try {
          ro?.disconnect();
        } catch {}
      };
    }
  }, [latest?.snapshot]);

  const { cursor } = useVisitorStream({ orgId, sessionId });

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
