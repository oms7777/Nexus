// apps/web/modules/live/hooks/useVisitorStream.ts
"use client";

import { useEffect, useRef, useState } from "react";
import Pusher, { type Channel } from "pusher-js";

export function useVisitorStream(opts: {
  orgId: string;
  sessionId: string;
  onRrwebEvents?: (events: any[]) => void;
}) {
  const { orgId, sessionId, onRrwebEvents } = opts;

  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const chanRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!orgId || !sessionId) return;

    // ✅ MAJ: force WS only (évite xhr_streaming qui peut freeze)
    try {
      window.localStorage.removeItem("pusherTransportTLS");
    } catch {}

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      forceTLS: true,
      enabledTransports: ["ws", "wss"],
      disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],
      channelAuthorization: {
        endpoint: "https://app.inboundless.co/api/realtime/pusher-auth",
        transport: "ajax",
      },
    });

    const chanName = `presence-org_${orgId}_session_${sessionId}`;
    const ch = pusher.subscribe(chanName) as Channel;
    chanRef.current = ch;

    ch.bind("pusher:subscription_succeeded", () => {
      // ok
    });

    ch.bind("client-cursor", (p: { x: number; y: number }) => {
      setCursor(p);
    });

    // ✅ MAJ: rrweb events live
    ch.bind("client-rrweb", (payload: any) => {
      const events = Array.isArray(payload?.events) ? payload.events : [];
      if (events.length && onRrwebEvents) onRrwebEvents(events);
    });

    return () => {
      ch.unbind_all();
      pusher.unsubscribe(chanName);
      pusher.disconnect();
      chanRef.current = null;
    };
  }, [orgId, sessionId, onRrwebEvents]);

  return { cursor };
}
