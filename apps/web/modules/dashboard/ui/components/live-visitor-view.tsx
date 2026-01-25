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
  height = 520,
}: {
  orgId: string;
  sessionId: string;
  clickUrl?: string;
  height?: number;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);

  // rrweb stage/replayer
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

  // ✅ pour recalculer curseur/layout (outerRef n’est pas réactif)
  const [box, setBox] = useState({ w: 0, h: 0 });

  const MAX_QUEUE = 5_000;
  const MAX_PER_FRAME = 120;

  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId: sessionId as unknown as Id<"contactSessions">,
      limit: 1,
    }) ?? [];
  const latest = snaps[0];

  const parsed = useMemo(() => {
    if (!latest?.snapshot) return null;
    try {
      return JSON.parse(latest.snapshot);
    } catch {
      return null;
    }
  }, [latest?.snapshot]);

  const [mode, setMode] = useState<"rrweb" | "iframe" | "empty">("empty");

  const v1 = useMemo(() => {
    if (!parsed) return null;
    if (isV1Snapshot(parsed)) return parsed as V1Snapshot;
    return null;
  }, [parsed]);

  // Fallback: si Convex contient déjà un snapshot rrweb
  useEffect(() => {
    if (!parsed) return;
    if (isRrwebEvents(parsed)) setMode("rrweb");
    else if (isV1Snapshot(parsed)) setMode((m) => (m === "rrweb" ? "rrweb" : "iframe"));
  }, [parsed]);

  // Mesure container
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    } else {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    return () => {
      try {
        ro?.disconnect();
      } catch {}
    };
  }, []);

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

    // ✅ cache rrweb mouse (on garde notre curseur custom)
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

    // ✅ fit to container (sans upscale)
    const scale = Math.min(vw / src.width, vh / src.height, 1);

    // ✅ si scale=1, pas de center => scroll/pan depuis top-left
    const contentW = src.width * scale;
    const contentH = src.height * scale;

    const ox = scale < 1 ? Math.max(0, (vw - contentW) / 2) : 0;
    const oy = scale < 1 ? Math.max(0, (vh - contentH) / 2) : 0;

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

      const w =
        meta.width ??
        (typeof latest?.width === "number" ? latest.width : undefined) ??
        1200;
      const h =
        meta.height ??
        (typeof latest?.height === "number" ? latest.height : undefined) ??
        800;

      sourceRef.current = { width: w, height: h };
      stage.style.width = `${w}px`;
      stage.style.height = `${h}px`;

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

  // Re-apply layout on box changes in rrweb mode
  useEffect(() => {
    if (mode !== "rrweb") return;
    applyLayout();
  }, [box.w, box.h, mode, applyLayout]);

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

      if (queueRef.current.length) rafRef.current = requestAnimationFrame(tick);
      else processingRef.current = false;
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const onRrweb = useCallback(
    (events: eventWithTime[]) => {
      if (mode !== "rrweb") return;
      if (!replayerRef.current) return;

      if (queueRef.current.length > MAX_QUEUE) {
        queueRef.current.splice(0, queueRef.current.length - Math.floor(MAX_QUEUE / 2));
      }

      queueRef.current.push(...events);
      processQueue();
    },
    [processQueue, mode],
  );

  const onSnapshot = useCallback(
    (events: eventWithTime[]) => {
      if (events.length === 1 && (events[0] as any)?.type === 4) return;
      setMode("rrweb");
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

  const previewUrl =
    clickUrl ||
    v1?.pageUrl ||
    (typeof latest?.pageUrl === "string" ? latest.pageUrl : undefined);

  // si pas rrweb live, iframe fallback
  useEffect(() => {
    if (mode === "rrweb") return;
    if (previewUrl) setMode("iframe");
    else setMode("empty");
  }, [previewUrl, mode]);

  const cursorPx = useMemo(() => {
    if (!cursor) return null;

    const cx = clamp01((cursor as Cursor).x);
    const cy = clamp01((cursor as Cursor).y);

    const outer = outerRef.current;
    if (!outer) return null;

    // iframe mode => pixels du container
    if (mode !== "rrweb" || !sourceRef.current) {
      return {
        left: cx * (box.w || outer.clientWidth),
        top: cy * (box.h || outer.clientHeight),
      };
    }

    const src = sourceRef.current;
    const { scale, ox, oy } = layoutRef.current;
    return {
      left: ox + cx * src.width * scale,
      top: oy + cy * src.height * scale,
    };
  }, [cursor, mode, box.w, box.h]);

  return (
    <div className="relative rounded-xl border overflow-hidden bg-black/5" style={{ height }}>
      {/* ✅ rrweb: overflow-auto pour pouvoir scroll si needed */}
      <div ref={outerRef} className="absolute inset-0 overflow-auto" />

      {/* ✅ iframe fallback */}
      {mode === "iframe" && (
        <div className="absolute inset-0">
          {!previewUrl ? (
            <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
              No preview url
            </div>
          ) : (
            <div className="h-full w-full relative">
              {/* ✅ bouton open (pas d’overlay qui bloque le scroll) */}
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="absolute top-2 right-2 z-20 rounded bg-black/60 px-2 py-1 text-[11px] text-white"
                title="Open current page"
              >
                Open
              </a>

              <iframe
                key={previewUrl}
                src={previewUrl}
                className="absolute inset-0 h-full w-full"
                style={{
                  border: "none",
                  pointerEvents: "auto", // ✅ scroll possible
                  background: "white",
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ✅ curseur live (rrweb + iframe) */}
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

      {mode === "empty" && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          No preview available
        </div>
      )}
    </div>
  );
}