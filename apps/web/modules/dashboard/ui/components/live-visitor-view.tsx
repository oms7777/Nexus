"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Replayer } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";

function safeParseSnapshot(raw: unknown): eventWithTime[] | null {
  if (!raw) return null;

  // Your DB stores it as string JSON (snapshot: v.string())
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as eventWithTime[];

      // fallback: { events: [...] }
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "events" in parsed &&
        Array.isArray((parsed as any).events)
      ) {
        return (parsed as any).events as eventWithTime[];
      }

      return null;
    } catch {
      return null;
    }
  }

  // Future-proof if you ever change storage format
  if (Array.isArray(raw)) return raw as eventWithTime[];

  if (
    typeof raw === "object" &&
    raw !== null &&
    "events" in raw &&
    Array.isArray((raw as any).events)
  ) {
    return (raw as any).events as eventWithTime[];
  }

  return null;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | null>(null);

  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // ✅ Convex expects Id<"contactSessions">, not string
  const snaps =
    useQuery(api.public.snapshots.listRecent, {
      sessionId,
      limit: 1,
    }) ?? [];

  const snapshot = snaps[0];

  const baseEvents = useMemo(() => {
    return safeParseSnapshot(snapshot?.snapshot);
  }, [snapshot?.snapshot]);

  // ✅ live stream (pusher)
  const { rrwebEvents, cursor } = useVisitorStream({ orgId, sessionId });

  // 1) Init replayer from latest snapshot
  useEffect(() => {
    setInitError(null);
    setReady(false);

    const root = containerRef.current;
    if (!root) return;

    // Cleanup existing replayer
    try {
      replayerRef.current?.destroy();
    } catch {}
    replayerRef.current = null;

    // No snapshot yet
    if (!baseEvents || baseEvents.length === 0) {
      root.innerHTML = "";
      return;
    }

    try {
      root.innerHTML = "";

      const rp = new Replayer(baseEvents, {
        root,
        liveMode: true,
        speed: 1,
      });

      replayerRef.current = rp;
      rp.play();
      setReady(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to init rrweb replayer";
      setInitError(msg);
      setReady(false);
    }

    return () => {
      try {
        replayerRef.current?.destroy();
      } catch {}
      replayerRef.current = null;
    };
  }, [baseEvents]);

  // 2) Feed live rrweb events into replayer
  useEffect(() => {
    if (!ready) return;
    const rp = replayerRef.current;
    if (!rp) return;
    if (!rrwebEvents || rrwebEvents.length === 0) return;

    try {
      for (const ev of rrwebEvents) {
        rp.addEvent(ev);
      }
    } catch {
      // ignore (rrweb can be picky)
    }
  }, [ready, rrwebEvents]);

  return (
    <div
      className="relative border rounded overflow-hidden bg-white"
      style={{ height }}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Cursor overlay (only if we have normalized coords) */}
      {cursor && (
        <div
          className="absolute w-3 h-3 bg-emerald-500 rounded-full z-50"
          style={{
            left: `${cursor.x * 100}%`,
            top: `${cursor.y * 100}%`,
            transform: "translate(-50%,-50%)",
          }}
        />
      )}

      {!baseEvents && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
          Waiting for first snapshot…
        </div>
      )}

      {initError && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600 bg-white/80">
          {initError}
        </div>
      )}
    </div>
  );
}
