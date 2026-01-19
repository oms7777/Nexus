"use client";

import { useRef, useEffect, useCallback } from "react";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "rrweb/typings/types";
import { Replayer } from "rrweb";

type Cursor = { x: number; y: number };

function extractMeta(events: eventWithTime[]) {
  // rrweb: Meta event type = 4
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
  sessionId: string;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null); // viewport fixed size
  const stageRef = useRef<HTMLDivElement | null>(null); // scaled canvas root
  const replayerRef = useRef<Replayer | null>(null);

  // queue processing (anti-freeze)
  const queueRef = useRef<eventWithTime[]>([]);
  const rafRef = useRef<number>(0);
  const processingRef = useRef(false);

  // source page dims
  const sourceRef = useRef<{ width: number; height: number } | null>(null);

  // layout state to position cursor correctly
  const layoutRef = useRef<{ scale: number; ox: number; oy: number }>({
    scale: 1,
    ox: 0,
    oy: 0,
  });

  // anti jitter
  const lastAppliedRef = useRef<string>("");

  const MAX_QUEUE = 5_000;
  const MAX_PER_FRAME = 120;

  // latest snapshot from DB (you store sessionSnapshots, but your query name is api.public.snapshots.listRecent)
  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId: sessionId as unknown as Id<"contactSessions">,
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
      stage.style.pointerEvents = "none"; // important: avoid interfering in overlay
      stageRef.current = stage;
      outer.appendChild(stage);
    }

    // hide rrweb cursor to avoid "2 cursors" (covers multiple rrweb versions)
    const existingStyle = outer.querySelector(
      "style[data-hide-rrweb-mouse='1']",
    );
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

    // scale based on source dims (stable)
    const scale = Math.min(vw / src.width, vh / src.height, 1);

    // center inside viewport
    const contentW = src.width * scale;
    const contentH = src.height * scale;
    const ox = Math.max(0, (vw - contentW) / 2);
    const oy = Math.max(0, (vh - contentH) / 2);

    // round a bit to prevent micro oscillations
    const s = Math.round(scale * 10000) / 10000;
    const x = Math.round(ox * 10) / 10;
    const y = Math.round(oy * 10) / 10;

    const signature = `${s}|${x}|${y}`;
    if (signature === lastAppliedRef.current) return;
    lastAppliedRef.current = signature;

    layoutRef.current = { scale: s, ox: x, oy: y };

    stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }, []);

  const destroyReplayer = useCallback(() => {
    try {
      replayerRef.current?.pause();
    } catch {}
    replayerRef.current = null;

    // reset queue
    queueRef.current = [];
    processingRef.current = false;

    try {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } catch {}
    rafRef.current = 0;

    // clean stage DOM only
    if (stageRef.current) stageRef.current.innerHTML = "";

    // reset layout state
    sourceRef.current = null;
    layoutRef.current = { scale: 1, ox: 0, oy: 0 };
    lastAppliedRef.current = "";
  }, []);

  const bootFromEvents = useCallback(
    (events: eventWithTime[]) => {
      const stage = ensureStage();
      const outer = outerRef.current;
      if (!outer || !stage) return;

      destroyReplayer();

      // infer source size from rrweb meta OR from DB record OR fallback
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

      // stage keeps original size; we scale/translate it
      stage.style.width = `${width}px`;
      stage.style.height = `${height}px`;

      try {
        const replayer = new Replayer(events, {
          root: stage,
          // best-effort across versions
          mouseTail: false as any,
        } as any);

        replayerRef.current = replayer;
        replayer.play();
      } catch {
        replayerRef.current = null;
      }

      // apply layout after DOM is mounted
      requestAnimationFrame(() => applyLayout());
    },
    [applyLayout, destroyReplayer, ensureStage, latest?.height, latest?.width],
  );

  // Init from latest snapshot DB
  useEffect(() => {
    if (!latest?.snapshot) return;

    ensureStage();

    try {
      const events = JSON.parse(latest.snapshot) as eventWithTime[];
      bootFromEvents(events);
    } catch (err) {
      console.error("[live] failed to init snapshot", err);
    }
  }, [latest?.snapshot, bootFromEvents, ensureStage]);

  // ResizeObserver = stable without loops
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    applyLayout();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => applyLayout());
      ro.observe(outer);
    } else {
      const onResize = () => applyLayout();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    return () => {
      try {
        ro?.disconnect();
      } catch {}
    };
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
          // ignore full snapshot in incremental stream
          if ((e as any)?.type === 2) continue;
          r.addEvent(e);
        } catch {}
        count++;
      }

      if (queueRef.current.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        processingRef.current = false;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const onRrweb = useCallback(
    (events: eventWithTime[]) => {
      if (!replayerRef.current) return;

      // drop strategy
      if (queueRef.current.length > MAX_QUEUE) {
        queueRef.current.splice(
          0,
          queueRef.current.length - Math.floor(MAX_QUEUE / 2),
        );
      }

      queueRef.current.push(...events);
      processQueue();
    },
    [processQueue],
  );

  const onSnapshot = useCallback(
    (events: eventWithTime[]) => {
      // ignore meta-only
      if (events.length === 1 && (events[0] as any)?.type === 4) return;

      // on full snapshot, reboot + re-layout (URL change)
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

  // compute overlay cursor position in pixels (scale + offset aware)
  let cursorPx: { left: number; top: number } | null = null;

  if (cursor) {
    const cx = clamp01((cursor as Cursor).x);
    const cy = clamp01((cursor as Cursor).y);

    const outer = outerRef.current;

    // ✅ If we don't have rrweb source size yet, fallback to viewport pixels
    if (!sourceRef.current || !outer) {
      if (outer) {
        cursorPx = {
          left: cx * outer.clientWidth,
          top: cy * outer.clientHeight,
        };
      }
    } else {
      const src = sourceRef.current;
      const { scale, ox, oy } = layoutRef.current;
      cursorPx = {
        left: ox + cx * src.width * scale,
        top: oy + cy * src.height * scale,
      };
    }
  }


  return (
    <div
      className="relative rounded-xl border overflow-hidden bg-black/5"
      style={{ height: 360 }}
    >
      {/* viewport */}
      <div ref={outerRef} className="absolute inset-0 overflow-hidden" />

      {/* single overlay cursor (pixel-accurate, no drift) */}
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
