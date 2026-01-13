// apps/web/modules/live/hooks/useVisitorStream.ts
"use client";

import { useEffect, useRef, useState } from "react";
import Pusher from "pusher-js";
import type { eventWithTime } from "@rrweb/types";
import { IncrementalSource } from "@rrweb/types";
import type { Id } from "@workspace/backend/_generated/dataModel";

type Cursor = { x: number; y: number };

function extractCursorFromEvent(ev: unknown): Cursor | null {
  const e = ev as any;
  if (!e || e.type !== 3) return null;

  const data = e.data;
  if (!data) return null;

  if (
    data.source === IncrementalSource.MouseMove &&
    Array.isArray(data.positions) &&
    data.positions.length
  ) {
    const last = data.positions[data.positions.length - 1];
    if (typeof last?.x !== "number" || typeof last?.y !== "number") return null;

    if (last.x >= 0 && last.x <= 1 && last.y >= 0 && last.y <= 1) {
      return { x: last.x, y: last.y };
    }

    return null;
  }

  return null;
}

export function useVisitorStream({
  orgId,
  sessionId,
}: {
  orgId: string;
  sessionId: Id<"contactSessions">;
}) {
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [rrwebEvents, setRrwebEvents] = useState<eventWithTime[]>([]);
  const [snapshotEvents, setSnapshotEvents] = useState<eventWithTime[] | null>(null);

  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    if (!orgId || !sessionId) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      forceTLS: true,
      enabledTransports: ["ws", "wss"],
      disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],
      authEndpoint: "https://app.inboundless.co/api/realtime/pusher-auth",
    });

    const channelName = `presence-org_${orgId}_session_${sessionId}`;
    const channel = pusher.subscribe(channelName);

    const onSnapshot = (payload: { events?: eventWithTime[] } | null | undefined) => {
      const events = payload?.events;
      if (!Array.isArray(events) || events.length === 0) return;

      // must contain FullSnapshot
      const hasFull = events.some((e: any) => e?.type === 2);
      if (!hasFull) return;

      setSnapshotEvents(events);
    };

    const onRrweb = (payload: { events?: eventWithTime[] } | null | undefined) => {
      const events = payload?.events;
      if (!Array.isArray(events) || events.length === 0) return;

      const filtered = events.filter(
        (evt): evt is eventWithTime =>
          typeof (evt as any)?.timestamp === "number" &&
          (evt as any).timestamp > lastTsRef.current,
      );

      if (filtered.length === 0) return;

      const last = filtered.at(-1);
      if (!last || typeof (last as any).timestamp !== "number") return;

      lastTsRef.current = (last as any).timestamp;

      for (let i = filtered.length - 1; i >= 0; i--) {
        const c = extractCursorFromEvent(filtered[i]);
        if (c) {
          setCursor(c);
          break;
        }
      }

      setRrwebEvents(filtered);
    };

    channel.bind("client-snapshot", onSnapshot);
    channel.bind("client-rrweb", onRrweb);
    channel.bind("client-cursor", (c: Cursor) => setCursor(c));

    return () => {
      try {
        channel.unbind("client-snapshot", onSnapshot);
        channel.unbind("client-rrweb", onRrweb);
        channel.unbind_all();
      } catch {}
      pusher.disconnect();
    };
  }, [orgId, sessionId]);

  return { cursor, rrwebEvents, snapshotEvents };
}
