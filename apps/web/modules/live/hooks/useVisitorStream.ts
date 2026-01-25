// apps/web/modules/live/hooks/useVisitorStream.ts
"use client";

import { useEffect, useRef, useState } from "react";
import Pusher, { type Channel } from "pusher-js";
import type { eventWithTime } from "rrweb/typings/types";

type Cursor = { x: number; y: number };

export function useVisitorStream(opts: {
  orgId: string;
  sessionId: string; // stream session id (for Pusher presence channel)
  onCursor?: (cursor: Cursor) => void;
  onRrweb?: (events: eventWithTime[]) => void;
  onSnapshot?: (events: eventWithTime[]) => void;
}) {
  const { orgId, sessionId, onCursor, onRrweb, onSnapshot } = opts;

  const [cursor, setCursor] = useState<Cursor | null>(null);
  const chanRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!orgId || !sessionId) return;

    let gotFirstSnapshot = false;
    let startTimer: ReturnType<typeof setInterval> | null = null;

    const requestStart = () =>
      fetch("/api/realtime/rrweb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, sessionId, action: "start" }),
      }).catch(() => {});

    const requestStop = () =>
      fetch("/api/realtime/rrweb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, sessionId, action: "stop" }),
      }).catch(() => {});

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      forceTLS: true,
      disableStats: true,
      enabledTransports: ["ws", "wss"],
      disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],
      channelAuthorization: {
        endpoint: "https://app.inboundless.co/api/realtime/pusher-auth",
        transport: "ajax",
        params: { orgId, sessionId },
      } as any,
    });

    const chanName = `presence-org_${orgId}_session_${sessionId}`;
    const ch = pusher.subscribe(chanName) as Channel;
    chanRef.current = ch;

    const handleCursor = (p: Cursor) => {
      setCursor(p);
      onCursor?.(p);
    };

    const handleInc = (payload: any) => {
      const events = (payload?.events ?? []) as eventWithTime[];
      if (events.length) onRrweb?.(events);
    };

    const handleSnap = (payload: any) => {
      const events = (payload?.events ?? []) as eventWithTime[];
      if (events.length) {
        gotFirstSnapshot = true;
        onSnapshot?.(events);
      }
    };

    ch.bind("client-cursor", handleCursor);
    ch.bind("client-rrweb", handleInc);
    ch.bind("client-snapshot", handleSnap);

    // ✅ START rrweb only when viewer subscription is READY + retry until snapshot
    ch.bind("pusher:subscription_succeeded", () => {
      requestStart();

      let attempts = 0;
      startTimer = setInterval(() => {
        attempts++;

        if (gotFirstSnapshot || attempts > 10) {
          if (startTimer) clearInterval(startTimer);
          startTimer = null;
          return;
        }

        requestStart();
      }, 1000);
    });

    return () => {
      if (startTimer) {
        clearInterval(startTimer);
        startTimer = null;
      }

      requestStop();

      try {
        ch.unbind("client-cursor", handleCursor);
        ch.unbind("client-rrweb", handleInc);
        ch.unbind("client-snapshot", handleSnap);
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
  }, [orgId, sessionId, onCursor, onRrweb, onSnapshot]);

  return { cursor };
}