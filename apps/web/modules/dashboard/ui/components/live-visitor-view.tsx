"use client";

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useLayoutEffect,
} from "react";

import { Replayer } from "rrweb";
import type { eventWithTime } from "rrweb/typings/types";

import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";

type Cursor = { x: number; y: number };

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function extractViewport(events: eventWithTime[]) {
  const meta = events.find((e: any) => e?.type === 4) as any;
  const full = events.find((e: any) => e?.type === 2) as any;
  const src = meta?.data ?? full?.data ?? {};

  return {
    width: typeof src.width === "number" ? src.width : 1280,
    height: typeof src.height === "number" ? src.height : 720,
  };
}

export function LiveVisitorView({
  orgId,
  streamSessionId,
  height = 520,
}: {
  orgId: string;
  streamSessionId: string;
  height?: number;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const replayerRef = useRef<Replayer | null>(null);

  const [viewport, setViewport] = useState({ w: 1280, h: 720 });
  const [hasStream, setHasStream] = useState(false);

  const [outerSize, setOuterSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    if (!outerRef.current) return;

    const update = () => {
      setOuterSize({
        w: outerRef.current!.clientWidth,
        h: outerRef.current!.clientHeight,
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(outerRef.current);

    return () => ro.disconnect();
  }, []);

  const ensureStage = useCallback(() => {
    if (!outerRef.current) return;

    if (!stageRef.current) {
      const stage = document.createElement("div");
      stage.style.position = "absolute";
      stage.style.top = "0";
      stage.style.left = "0";
      stage.style.transformOrigin = "top left";
      stage.style.pointerEvents = "none";

      outerRef.current.appendChild(stage);
      stageRef.current = stage;
    }

    return stageRef.current;
  }, []);

  const applyScale = useCallback(() => {
    if (!stageRef.current) return;
    if (!outerSize.w || !outerSize.h) return;

    const scale = Math.min(outerSize.w / viewport.w, outerSize.h / viewport.h);
    const ox = (outerSize.w - viewport.w * scale) / 2;
    const oy = (outerSize.h - viewport.h * scale) / 2;

    stageRef.current.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
  }, [outerSize, viewport]);

  useEffect(() => {
    applyScale();
  }, [applyScale]);

  const bootReplay = useCallback(
    (events: eventWithTime[]) => {
      const stage = ensureStage();
      if (!stage) return;

      setHasStream(true);

      const vp = extractViewport(events);
      setViewport({ w: vp.width, h: vp.height });

      stage.style.width = `${vp.width}px`;
      stage.style.height = `${vp.height}px`;
      stage.innerHTML = "";

      const replay = new Replayer(events, {
        root: stage,
        liveMode: true,
        mouseTail: false,
      });

      replayerRef.current = replay;
      replay.play();

      requestAnimationFrame(applyScale);
    },
    [applyScale, ensureStage],
  );

  const onRrweb = useCallback((events: eventWithTime[]) => {
    if (!replayerRef.current) return;
    for (const ev of events) {
      try {
        replayerRef.current.addEvent(ev);
      } catch {}
    }
  }, []);

  const [cursor, setCursor] = useState<Cursor | null>(null);

  useVisitorStream({
    orgId,
    sessionId: streamSessionId,
    onSnapshot: bootReplay,
    onRrweb,
    onCursor: setCursor, // ✅ now supported
  });

  const cursorPx = (() => {
    if (!cursor) return null;
    if (!outerSize.w || !outerSize.h) return null;

    const cx = clamp01(cursor.x);
    const cy = clamp01(cursor.y);

    const scale = Math.min(outerSize.w / viewport.w, outerSize.h / viewport.h);
    const ox = (outerSize.w - viewport.w * scale) / 2;
    const oy = (outerSize.h - viewport.h * scale) / 2;

    return {
      left: ox + cx * viewport.w * scale,
      top: oy + cy * viewport.h * scale,
    };
  })();

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border bg-black/5"
      style={{ height }}
    >
      <div ref={outerRef} className="absolute inset-0" />

      {cursorPx && (
        <div
          className="absolute z-50 size-4 rounded-full bg-emerald-500 ring-2 ring-white"
          style={{
            left: cursorPx.left,
            top: cursorPx.top,
            transform: "translate(-50%,-50%)",
          }}
        />
      )}

      {!hasStream && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Waiting for visitor live stream…
        </div>
      )}
    </div>
  );
}