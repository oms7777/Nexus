"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "rrweb/typings/types";
import { Replayer } from "rrweb";

type Cursor = { x: number; y: number };

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function safeJsonParse(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractMetaFromRrweb(events: eventWithTime[]) {
  const meta = events.find((e: any) => e?.type === 4) as any;
  const full = events.find((e: any) => e?.type === 2) as any;
  const src = meta?.data ?? full?.data ?? {};

  const width = typeof src?.width === "number" ? src.width : undefined;
  const height = typeof src?.height === "number" ? src.height : undefined;

  return { width, height };
}

export function LiveVisitorView({
  orgId,
  sessionId,
  clickUrl,
}: {
  orgId: string;
  sessionId: string;
  clickUrl?: string;
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
  const MAX_PER_FRAME = 120;

  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId: sessionId as unknown as Id<"contactSessions">,
      limit: 1,
    }) ?? [];

  const latest = snaps[0];

  const latestParsed = useMemo(() => {
    const raw = latest?.snapshot;
    if (!raw) return null;
    return safeJsonParse(raw);
  }, [latest?.snapshot]);

  const isRrweb = useMemo(() => Array.isArray(latestParsed), [latestParsed]);

  const isV1Meta = useMemo(() => {
    if (!latestParsed || Array.isArray(latestParsed)) return false;
    return latestParsed?.v === 1 && (latestParsed?.kind === "meta" || !latestParsed?.kind);
  }, [latestParsed]);

  const isV2Image = useMemo(() => {
    if (!latestParsed || Array.isArray(latestParsed)) return false;
    return latestParsed?.v === 2 && latestParsed?.kind === "image";
  }, [latestParsed]);

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

    const scale = Math.min(vw / src.width, vh / src.height, 1);

    const contentW = src.width * scale;
    const contentH = src.height * scale;
    const ox = Math.max(0, (vw - contentW) / 2);
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

  const destroyReplayer = useCallback(() => {
    try {
      replayerRef.current?.pause();
    } catch {}
    replayerRef.current = null;

    queueRef.current = [];
    processingRef.current = false;

    try {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } catch {}
    rafRef.current = 0;

    if (stageRef.current) stageRef.current.innerHTML = "";

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

      const meta = extractMetaFromRrweb(events);

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
        } as any);

        replayerRef.current = replayer;
        replayer.play();
      } catch {
        replayerRef.current = null;
      }

      requestAnimationFrame(() => applyLayout());
    },
    [applyLayout, destroyReplayer, ensureStage, latest?.height, latest?.width],
  );

  // Init from latest snapshot (rrweb only)
  useEffect(() => {
    if (!latest?.snapshot) return;
    if (!isRrweb) return;

    ensureStage();

    const parsed = safeJsonParse(latest.snapshot);
    if (!Array.isArray(parsed)) return;

    bootFromEvents(parsed as eventWithTime[]);
  }, [latest?.snapshot, isRrweb, bootFromEvents, ensureStage]);

  // Handle resize
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

  if (cursor) {
    const cx = clamp01((cursor as Cursor).x);
    const cy = clamp01((cursor as Cursor).y);

    const outer = outerRef.current;

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

  const resolvedClickUrl =
    clickUrl ||
    (typeof latest?.pageUrl === "string" ? latest.pageUrl : undefined) ||
    (typeof latestParsed?.pageUrl === "string" ? latestParsed.pageUrl : undefined);

  const click = () => {
    if (!resolvedClickUrl) return;
    try {
      window.open(resolvedClickUrl, "_blank", "noopener,noreferrer");
    } catch {}
  };

  return (
    <div className="relative rounded-xl border overflow-hidden bg-black/5" style={{ height: 360 }}>
      {/* Click overlay */}
      <button
        type="button"
        onClick={click}
        className="absolute inset-0 z-10 cursor-pointer"
        style={{ background: "transparent" }}
        title={resolvedClickUrl ? `Open: ${resolvedClickUrl}` : "No URL"}
      />

      {/* Stage */}
      <div ref={outerRef} className="absolute inset-0 overflow-hidden" />

      {/* If we DON'T have rrweb, show a clean meta preview */}
      {!isRrweb && (
        <div className="absolute inset-0 z-0 p-3">
          <div className="h-full w-full rounded-lg border bg-background/70 backdrop-blur-sm p-3 flex flex-col justify-between">
            <div>
              <div className="text-sm font-semibold">Page preview</div>

              <div className="mt-2 text-xs text-muted-foreground">
                {typeof latest?.title === "string" && latest.title.trim().length
                  ? latest.title
                  : typeof latestParsed?.title === "string"
                    ? latestParsed.title
                    : "—"}
              </div>

              <div className="mt-2 text-xs break-all text-muted-foreground">
                {resolvedClickUrl ?? "No URL"}
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground">
              {isV2Image
                ? "Snapshot: image (v2)"
                : isV1Meta
                  ? "Snapshot: meta (v1)"
                  : "Snapshot: unknown format"}
            </div>

            {/* If V2 image exists, render it */}
            {isV2Image && typeof latestParsed?.dataUrl === "string" && (
              <div className="mt-3 flex-1 overflow-hidden rounded-md border bg-black/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={latestParsed.dataUrl}
                  alt="snapshot"
                  className="h-full w-full object-contain"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {cursorPx && (
        <div
          className="absolute z-20 size-4 rounded-full bg-emerald-500/80 ring-2 ring-white/70 pointer-events-none"
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
