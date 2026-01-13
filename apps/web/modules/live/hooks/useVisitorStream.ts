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

  // rrweb mousemove incremental event
  if (data.source === IncrementalSource.MouseMove && Array.isArray(data.positions) && data.positions.length) {
    const last = data.positions[data.positions.length - 1];
    if (typeof last?.x !== "number" || typeof last?.y !== "number") return null;

    // If already normalized (0..1), use it
    if (last.x >= 0 && last.x <= 1 && last.y >= 0 && last.y <= 1) {
      return { x: last.x, y: last.y };
    }

    // Otherwise it's probably pixels (we can't normalize reliably without width/height)
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

      // Try to reconstruct cursor from rrweb mousemove
      for (let i = filtered.length - 1; i >= 0; i--) {
        const c = extractCursorFromEvent(filtered[i]);
        if (c) {
          setCursor(c);
          break;
        }
      }

      setRrwebEvents(filtered);
    };

    channel.bind("client-rrweb", onRrweb);

    // optional compat
    channel.bind("client-cursor", (c: Cursor) => setCursor(c));

    return () => {
      try {
        channel.unbind("client-rrweb", onRrweb);
        channel.unbind_all();
      } catch {}
      pusher.disconnect();
    };
  }, [orgId, sessionId]);

  return { cursor, rrwebEvents };
}
