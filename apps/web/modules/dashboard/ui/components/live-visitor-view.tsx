"use client";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "rrweb/typings/types";
import { Replayer } from "rrweb";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";

type Cursor = { x: number; y: number };

type V1Snapshot = {
  v: 1;
  pageUrl?: string;
  title?: string;
  width?: number;
  height?: number;
  ts?: number;
};

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function isRrwebEvents(x: any): x is eventWithTime[] {
  return Array.isArray(x) && x.length >= 1 && typeof x[0] === "object";
}

function isV1Snapshot(x: any): x is V1Snapshot {
  return !!x && typeof x === "object" && x.v === 1;
}

function extractMeta(events: eventWithTime[]) {
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
  height = 360,
}: {
  orgId: string;
  sessionId: string;
  clickUrl?: string;
  height?: number;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);

  // rrweb mode
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

  // Parse snapshot once
  const parsed = useMemo(() => {
    if (!latest?.snapshot) return null;
    try {
      return JSON.parse(latest.snapshot);
    } catch {
      return null;
    }
  }, [latest?.snapshot]);

  const mode: "rrweb" | "iframe" | "empty" = useMemo(() => {
    if (!parsed) return "empty";
    if (isRrwebEvents(parsed)) return "rrweb";
    if (isV1Snapshot(parsed)) return "iframe";
    return "empty";
  }, [parsed]);

  const v1 = useMemo(() => {
    if (mode !== "iframe") return null;
    return parsed as V1Snapshot;
  }, [mode, parsed]);

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

  // Init either rrweb or iframe mode
  useEffect(() => {
    if (!latest?.snapshot) return;

    // If we switch to iframe mode, stop rrweb clean
    if (mode !== "rrweb") {
      destroyReplayer();
      return;
    }

    ensureStage();

    try {
      const events = JSON.parse(latest.snapshot) as any;
      if (isRrwebEvents(events)) bootFromEvents(events);
    } catch (err) {
      console.error("[live] failed to init snapshot", err);
    }
  }, [latest?.snapshot, mode, bootFromEvents, ensureStage, destroyReplayer]);

  // Resize layout only for rrweb mode
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    if (mode !== "rrweb") return;

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
  }, [applyLayout, mode]);

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
      if (mode !== "rrweb") return;
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
    [processQueue, mode],
  );

  const onSnapshot = useCallback(
    (events: eventWithTime[]) => {
      if (mode !== "rrweb") return;
      if (events.length === 1 && (events[0] as any)?.type === 4) return;
      bootFromEvents(events);
    },
    [bootFromEvents, mode],
  );

  const { cursor } = useVisitorStream({
    orgId,
    sessionId,
    onRrweb,
    onSnapshot,
  });

  // Cursor positioning (works both modes)
  const cursorPx = useMemo(() => {
    if (!cursor) return null;

    const cx = clamp01((cursor as Cursor).x);
    const cy = clamp01((cursor as Cursor).y);

    const outer = outerRef.current;
    if (!outer) return null;

    // iframe mode => use container pixels directly
    if (mode !== "rrweb" || !sourceRef.current) {
      return {
        left: cx * outer.clientWidth,
        top: cy * outer.clientHeight,
      };
    }

    const src = sourceRef.current;
    const { scale, ox, oy } = layoutRef.current;
    return {
      left: ox + cx * src.width * scale,
      top: oy + cy * src.height * scale,
    };
  }, [cursor, mode]);

  // ---- iframe preview handling
  const [iframeBlocked, setIframeBlocked] = useState(false);

  const previewUrl =
    clickUrl ||
    v1?.pageUrl ||
    (typeof latest?.pageUrl === "string" ? latest.pageUrl : undefined);

  return (
    <div
      className="relative rounded-xl border overflow-hidden bg-black/5"
      style={{ height }}
    >
      <div ref={outerRef} className="absolute inset-0 overflow-hidden" />

      {/* ✅ V1 lightweight = iframe preview */}
      {mode === "iframe" && (
        <div className="absolute inset-0">
          {!previewUrl ? (
            <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
              No preview url
            </div>
          ) : (
            <div className="h-full w-full relative">
              {/* clickable overlay */}
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="absolute inset-0 z-10"
                title="Open current page"
              />

              {/* iframe */}
              <iframe
                key={previewUrl}
                src={previewUrl}
                className="absolute inset-0 h-full w-full"
                style={{
                  border: "none",
                  pointerEvents: "none", // keep it as a thumbnail
                  background: "white",
                }}
                onLoad={() => {
                  // If the site blocks framing, onLoad may still fire blank.
                  // We detect block heuristically by a timer + contentWindow check in try/catch.
                  setTimeout(() => {
                    try {
                      // Some browsers throw if cross-origin; that's fine.
                      // If framed is blocked, often iframe shows browser error page; we can't read it.
                      // So we only keep a manual fallback toggle (below) if user sees blank.
                    } catch {}
                  }, 200);
                }}
              />

              {/* fallback banner if user sees blank (manual switch) */}
              {iframeBlocked && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 z-20">
                  <div className="text-xs text-muted-foreground">
                    Preview blocked by the website (CSP / X-Frame-Options)
                  </div>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline"
                  >
                    Open page
                  </a>
                </div>
              )}

              {!iframeBlocked && (
                <button
                  type="button"
                  onClick={() => setIframeBlocked(true)}
                  className="absolute bottom-2 right-2 z-20 rounded bg-black/60 px-2 py-1 text-[10px] text-white"
                  title="If the preview is blank, enable fallback"
                >
                  Preview blank?
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ✅ rrweb mode = replay */}
      {/* (nothing special here; stage is appended in outerRef) */}

      {cursorPx && (
        <div
          className="absolute size-4 rounded-full bg-emerald-500/80 ring-2 ring-white/70 pointer-events-none z-30"
          style={{
            left: `${cursorPx.left}px`,
            top: `${cursorPx.top}px`,
            transform: "translate(-50%,-50%)",
          }}
        />
      )}

      {/* empty state */}
      {mode === "empty" && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          No preview available
        </div>
      )}
    </div>
  );
}
