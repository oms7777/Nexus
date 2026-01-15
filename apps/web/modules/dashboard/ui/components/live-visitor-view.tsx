"use client";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "rrweb/typings/types";
import { Replayer } from "rrweb";

type MetaInfo = { width?: number; height?: number };

function extractMeta(events: eventWithTime[]): MetaInfo {
  // rrweb Meta event type = 4
  const meta = events.find((e: any) => e?.type === 4) as any;
  const d = meta?.data ?? {};
  return {
    width: typeof d?.width === "number" ? d.width : undefined,
    height: typeof d?.height === "number" ? d.height : undefined,
  };
}

export function LiveVisitorView({
  orgId,
  sessionId,
}: {
  orgId: string;
  sessionId: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const replayerRef = useRef<Replayer | null>(null);

  const [meta, setMeta] = useState<MetaInfo>({});

  // queue processing (anti-freeze)
  const queueRef = useRef<eventWithTime[]>([]);
  const rafRef = useRef<number>(0);
  const processingRef = useRef(false);

  const MAX_QUEUE = 5_000;
  const MAX_PER_FRAME = 120;

  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId: sessionId as unknown as Id<"contactSessions">,
      limit: 1,
    }) ?? [];

  const latest = snaps[0];

  const computeScale = useCallback(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage) return;

    const rootRect = root.getBoundingClientRect();

    const baseW = meta.width || stage.scrollWidth || stage.offsetWidth || 1;
    const baseH = meta.height || stage.scrollHeight || stage.offsetHeight || 1;

    const scale = Math.min(rootRect.width / baseW, rootRect.height / baseH, 1);

    stage.style.transformOrigin = "top left";
    stage.style.transform = `scale(${scale})`;
  }, [meta.width, meta.height]);

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
  }, []);

  const bootFromEvents = useCallback(
    (events: eventWithTime[]) => {
      if (!stageRef.current) return;

      destroyReplayer();

      // meta for scale
      const m = extractMeta(events);
      setMeta(m);

      // reset stage
      stageRef.current.innerHTML = "";

      try {
        const replayer = new Replayer(events, { root: stageRef.current });
        replayerRef.current = replayer;
        replayer.play();
      } catch {
        replayerRef.current = null;
      }

      requestAnimationFrame(() => computeScale());
    },
    [computeScale, destroyReplayer],
  );

  // Init depuis snapshot DB
  useEffect(() => {
    if (!latest?.snapshot) return;

    try {
      const events = JSON.parse(latest.snapshot) as eventWithTime[];
      bootFromEvents(events);

      const onResize = () => computeScale();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    } catch (err) {
      console.error("[live] failed to init snapshot", err);
    }
  }, [latest?.snapshot, bootFromEvents, computeScale]);

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
      // meta-only: ignore
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

  const baseW = useMemo(() => meta.width || 1200, [meta.width]);
  const baseH = useMemo(() => meta.height || 800, [meta.height]);

  return (
    <div
      ref={rootRef}
      className="relative rounded-xl border overflow-hidden bg-black/5"
      style={{ height: 360 }}
    >
      {/* ✅ stage : tout ce qui doit scaler (replayer + cursor) */}
      <div
        ref={stageRef}
        className="absolute left-0 top-0"
        style={{
          width: baseW,
          height: baseH,
        }}
      />

      {/* ✅ cursor rendu dans la même “stage” => toujours aligné */}
      {cursor && (
        <div
          className="absolute size-4 rounded-full bg-emerald-500/80 ring-2 ring-white/70 pointer-events-none"
          style={{
            left: `${cursor.x * baseW}px`,
            top: `${cursor.y * baseH}px`,
            transform: "translate(-50%,-50%)",
          }}
        />
      )}
    </div>
  );
}
