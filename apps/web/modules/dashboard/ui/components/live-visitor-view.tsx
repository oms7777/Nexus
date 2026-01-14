// ✅ apps/web/modules/dashboard/ui/components/live-visitor-view.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { eventWithTime } from "@rrweb/types";
import { Replayer } from "rrweb";
import "rrweb/dist/rrweb.css";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";

export function LiveVisitorView({
  orgId,
  sessionId,
}: {
  orgId: string;
  sessionId: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const replayerRef = useRef<Replayer | null>(null);

  const [hasSnapshot, setHasSnapshot] = useState(false);

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

  const destroyReplayer = useCallback(() => {
    try {
      replayerRef.current?.pause();
      replayerRef.current?.destroy();
    } catch {}
    replayerRef.current = null;
  }, []);

  const initFromSnapshot = useCallback(
    (events: eventWithTime[]) => {
      if (!containerRef.current) return;
      if (!events?.length) return;

      // reset ui
      setHasSnapshot(true);

      // cleanup previous
      destroyReplayer();

      // reset container
      containerRef.current.innerHTML = "";

      const replayer = new Replayer(events, {
        root: containerRef.current,
      });

      replayerRef.current = replayer;

      try {
        replayer.play();
      } catch {}

      requestAnimationFrame(() => applyScale());
    },
    [applyScale, destroyReplayer],
  );

  const onRrweb = useCallback((events: eventWithTime[]) => {
    const r = replayerRef.current;
    if (!r) return;

    try {
      for (const e of events) {
        // never re-apply FullSnapshot in live stream
        if ((e as any)?.type === 2) continue;
        r.addEvent(e);
      }
    } catch {
      // ignore
    }
  }, []);

  const { cursor } = useVisitorStream({
    orgId,
    sessionId,
    onSnapshot: initFromSnapshot,
    onRrweb,
  });

  useEffect(() => {
    const onResize = () => applyScale();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      destroyReplayer();
    };
  }, [applyScale, destroyReplayer]);

  return (
    <div
      className="relative rounded-xl border overflow-hidden bg-black/5"
      style={{ height: 360 }}
    >
      {/* rrweb zone */}
      <div ref={containerRef} className="absolute inset-0 overflow-hidden" />

      {/* Waiting state */}
      {!hasSnapshot && (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          Waiting for snapshot…
        </div>
      )}

      {/* live cursor */}
      {cursor && hasSnapshot && (
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
