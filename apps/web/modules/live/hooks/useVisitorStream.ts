"use client";

import { useEffect, useRef, useState } from "react";
import Pusher, { type Channel } from "pusher-js";
import type { eventWithTime } from "@rrweb/types";

type Cursor = { x: number; y: number };

export function useVisitorStream(opts: { orgId: string; sessionId: string; onRrweb?: (events: eventWithTime[]) => void; onSnapshot?: (events: eventWithTime[]) => void; }) {
  const { orgId, sessionId, onRrweb, onSnapshot } = opts;
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const chanRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!orgId || !sessionId) return;

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

    ch.bind("client-cursor", (p: Cursor) => setCursor(p));
    ch.bind("client-rrweb", (payload: any) => {
      const events = (payload?.events ?? []) as eventWithTime[];
      if (events.length && onRrweb) onRrweb(events);
    });

    ch.bind("client-snapshot", (payload: any) => {
      const events = (payload?.events ?? []) as eventWithTime[];
      if (events.length && onSnapshot) onSnapshot(events);
    });

    return () => {
      ch.unbind_all();
      pusher.unsubscribe(chanName);
      pusher.disconnect();
    };
  }, [orgId, sessionId, onRrweb, onSnapshot]);

  return { cursor };
}
