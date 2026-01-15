"use client";

import { useEffect, useRef, useState } from "react";
import Pusher, { type Channel } from "pusher-js";
import type { eventWithTime } from "rrweb/typings/types";

type Cursor = { x: number; y: number };

export function useVisitorStream(opts: {
  orgId: string;
  sessionId: string;
  onRrweb?: (events: eventWithTime[]) => void;
  onSnapshot?: (events: eventWithTime[]) => void;
}) {
  const { orgId, sessionId, onRrweb, onSnapshot } = opts;

  const [cursor, setCursor] = useState<Cursor | null>(null);
  const chanRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!orgId || !sessionId) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      forceTLS: true,
      disableStats: true,
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

    const onCursor = (p: Cursor) => setCursor(p);

    const onInc = (payload: any) => {
      const events = (payload?.events ?? []) as eventWithTime[];
      if (events.length && onRrweb) onRrweb(events);
    };

    const onSnap = (payload: any) => {
      const events = (payload?.events ?? []) as eventWithTime[];
      if (events.length && onSnapshot) onSnapshot(events);
    };

    ch.bind("client-cursor", onCursor);
    ch.bind("client-rrweb", onInc);
    ch.bind("client-snapshot", onSnap);

    return () => {
      try {
        ch.unbind("client-cursor", onCursor);
        ch.unbind("client-rrweb", onInc);
        ch.unbind("client-snapshot", onSnap);
        ch.unbind_all();
      } catch {}
      try {
        pusher.unsubscribe(chanName);
      } catch {}
      try {
        pusher.disconnect();
      } catch {}
      chanRef.current = null;
    };
  }, [orgId, sessionId, onRrweb, onSnapshot]);

  return { cursor };
}
