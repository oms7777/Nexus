// LiveVisitorView.tsx — MAJ: reset on sessionId change (important)
"use client";

import { useRef, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "rrweb/typings/types";
import { Replayer } from "rrweb";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";

type Cursor = { x: number; y: number };

function extractMeta(events: eventWithTime[]) {
  const meta = events.find((e: any) => e?.type === 4) as any;
  const full = events.find((e: any) => e?.type === 2) as any;
  const src = meta?.data ?? full?.data ?? {};

  const width = typeof src?.width === "number" ? src.width : undefined;
  const height = typeof src?.height === "number" ? src.height : undefined;

  return { width, height };
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function LiveVisitorView({
  orgId,
  sessionId,
}: {
  orgId: string;
  sessionId: Id<"contactSessions">;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const replayerRef = useRef<Replayer | null>(null);

  const queueRef = useRef<eventWithTime[]>([]);
  const rafRef = useRef<number>(0);
  const processingRef = useRef(false);

  const sourceRef = useRef<{ width: number; height: number } | null>(null);

  const layoutRef = useRef<{ scale: number; ox: number; oy: number }>({
    scale: 1,
    ox: 0,
    oy: 0,
  });

  const lastAppliedRef = useRef<string>("");

  const MAX_QUEUE = 5_000;
  const MAX_PER_FRAME = 180;

  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId,
      limit: 1,
    }) ?? [];

  const latest = snaps[0];

  const ensureStage = useCallback(() => {
    const outer = outerRef.current;
    if (!outer) return null;

    if (!stageRef.current) {
      const stage = document.createElement("div");
      stage.style.position = "absolute";
      stage.style.left = "0";
      stage.style.top = "0";
      stage.style.transformOrigin = "top left";
      stage.style.willChange = "transform";
      stage.style.pointerEvents = "none";
      stageRef.current = stage;
      outer.appendChild(stage);
    }

    const existingStyle = outer.querySelector("style[data-hide-rrweb-mouse='1']");
    if (!existingStyle) {
      const style = document.createElement("style");
      style.setAttribute("data-hide-rrweb-mouse", "1");
      style.innerHTML = `
        .replayer-mouse,
        .replayer-mouse-tail,
        .rrweb-mouse,
        .rrweb-mouse-tail,
        .rrweb-mouse-cursor,
        .rrweb-mouse-pointer,
        .rrweb-mouse-pointer-cursor {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
        }
      `;
      outer.appendChild(style);
    }

    return stageRef.current;
  }, []);

  const applyLayout = useCallback(() => {
    const outer = outerRef.current;
    const stage = stageRef.current;
    const src = sourceRef.current;

    if (!outer || !stage || !src?.width || !src?.height) return;

    const vw = outer.clientWidth;
    const vh = outer.clientHeight;
    if (!vw || !vh) return;

    const scale = vw / src.width;

    const contentW = src.width * scale;
    const contentH = src.height * scale;
    const ox = 0;
    const oy = Math.max(0, (vh - contentH) / 2);

    const s = Math.round(scale * 10000) / 10000;
    const x = Math.round(ox * 10) / 10;
    const y = Math.round(oy * 10) / 10;

    const signature = `${s}|${x}|${y}`;
    if (signature === lastAppliedRef.current) return;
    lastAppliedRef.current = signature;

    layoutRef.current = { scale: s, ox: x, oy: y };
    stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }, []);

  const stopRAF = useCallback(() => {
    try {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } catch {}
    rafRef.current = 0;
  }, []);

  const destroyReplayer = useCallback(() => {
    stopRAF();

    try {
      replayerRef.current?.pause();
    } catch {}
    replayerRef.current = null;

    queueRef.current = [];
    processingRef.current = false;

    if (stageRef.current) stageRef.current.innerHTML = "";

    sourceRef.current = null;
    layoutRef.current = { scale: 1, ox: 0, oy: 0 };
    lastAppliedRef.current = "";
  }, [stopRAF]);

  // ✅ MAJ: reset hard when session changes
  useEffect(() => {
    destroyReplayer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const bootFromEvents = useCallback(
    (events: eventWithTime[]) => {
      const stage = ensureStage();
      const outer = outerRef.current;
      if (!outer || !stage) return;

      destroyReplayer();

      const meta = extractMeta(events);

      const width =
        meta.width ??
        (typeof latest?.width === "number" ? latest.width : undefined) ??
        1200;

      const height =
        meta.height ??
        (typeof latest?.height === "number" ? latest.height : undefined) ??
        800;

      sourceRef.current = { width, height };
      stage.style.width = `${width}px`;
      stage.style.height = `${height}px`;

      try {
        const replayer = new Replayer(events, {
          root: stage,
          mouseTail: false as any,
          liveMode: true,
        } as any);

        replayerRef.current = replayer;

        const anyR: any = replayer;
        if (typeof anyR.startLive === "function") anyR.startLive();
        else replayer.play();
      } catch {
        replayerRef.current = null;
      }

      requestAnimationFrame(() => applyLayout());
    },
    [applyLayout, destroyReplayer, ensureStage, latest?.height, latest?.width],
  );

  useEffect(() => {
    if (!latest?.snapshot) return;

    ensureStage();

    try {
      const events = JSON.parse(latest.snapshot) as eventWithTime[];
      bootFromEvents(events);
    } catch (err) {
      console.error("[live] failed to init snapshot", err);
    }
  }, [latest?.snapshot, ensureStage, bootFromEvents]);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    applyLayout();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => applyLayout());
      ro.observe(outer);
      return () => {
        try {
          ro?.disconnect();
        } catch {}
      };
    }

    const onResize = () => applyLayout();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyLayout]);

  const processQueue = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;

    const tick = () => {
      rafRef.current = 0;
      const r = replayerRef.current;
      if (!r) {
        processingRef.current = false;
        queueRef.current = [];
        return;
      }

      let count = 0;
      while (queueRef.current.length && count < MAX_PER_FRAME) {
        const e = queueRef.current.shift()!;
        try {
          if ((e as any)?.type === 2) continue;

          r.addEvent(e);

          const t = (e as any)?.type;
          const src = (e as any)?.data?.source;
          const isMetaOrResize =
            t === 4 ||
            (t === 3 &&
              (src === 4 ||
                src === "viewport-resize" ||
                src === "ViewportResize" ||
                src === "IncrementalSource.ViewportResize"));

          if (isMetaOrResize) requestAnimationFrame(() => applyLayout());
        } catch {}
        count++;
      }

      if (queueRef.current.length) rafRef.current = requestAnimationFrame(tick);
      else processingRef.current = false;
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [applyLayout]);

  const onRrweb = useCallback(
    (events: eventWithTime[]) => {
      if (!replayerRef.current) return;

      if (queueRef.current.length > MAX_QUEUE) {
        queueRef.current.splice(0, queueRef.current.length - Math.floor(MAX_QUEUE / 2));
      }

      queueRef.current.push(...events);
      processQueue();
    },
    [processQueue],
  );

  const onSnapshot = useCallback(
    (events: eventWithTime[]) => {
      if (events.length === 1 && (events[0] as any)?.type === 4) return;
      bootFromEvents(events);
    },
    [bootFromEvents],
  );

  const { cursor } = useVisitorStream({
    orgId,
    sessionId,
    onRrweb,
    onSnapshot,
  });

  let cursorPx: { left: number; top: number } | null = null;
  const src = sourceRef.current;

  if (cursor && src?.width && src?.height) {
    const { scale, ox, oy } = layoutRef.current;
    const cx = clamp01((cursor as Cursor).x);
    const cy = clamp01((cursor as Cursor).y);

    cursorPx = {
      left: ox + cx * src.width * scale,
      top: oy + cy * src.height * scale,
    };
  }

  return (
    <div className="relative rounded-xl border overflow-hidden bg-black/5" style={{ height: 520 }}>
      <div ref={outerRef} className="absolute inset-0 overflow-hidden" />

      {cursorPx && (
        <div
          className="absolute size-4 rounded-full bg-emerald-500/80 ring-2 ring-white/70 pointer-events-none"
          style={{
            left: `${cursorPx.left}px`,
            top: `${cursorPx.top}px`,
            transform: "translate(-50%,-50%)",
          }}
        />
      )}
    </div>
  );
}
