"use client";

import { useEffect, useRef, useState } from "react";
import Pusher, { type Channel } from "pusher-js";
import type { eventWithTime } from "rrweb/typings/types";

type Cursor = { x: number; y: number };

function coerceCursor(payload: any): Cursor | null {
  if (!payload) return null;

  // payload direct {x,y}
  if (typeof payload.x === "number" && typeof payload.y === "number") {
    return { x: payload.x, y: payload.y };
  }

  // payload { cursor: {x,y} }
  const c = payload.cursor;
  if (c && typeof c.x === "number" && typeof c.y === "number") {
    return { x: c.x, y: c.y };
  }

  return null;
}

export function useVisitorStream(opts: {
  orgId: string;
  sessionId: string;
  onRrweb?: (events: eventWithTime[]) => void;
  onSnapshot?: (events: eventWithTime[]) => void;
}) {
  const { orgId, sessionId, onRrweb, onSnapshot } = opts;

  const [cursor, setCursor] = useState<Cursor | null>(null);
  const chanRef = useRef<Channel | null>(null);
  const pusherRef = useRef<Pusher | null>(null);

  useEffect(() => {
    // reset cursor à chaque changement
    setCursor(null);

    if (!orgId || !sessionId) return;

    // ✅ déclenche rrweb côté visiteur
    fetch("/api/realtime/rrweb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, sessionId, action: "start" }),
    }).catch(() => {});

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      forceTLS: true,
      disableStats: true,
      enabledTransports: ["ws", "wss"],
      disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],

      // ✅ IMPORTANT: orgId/sessionId passés au backend auth
      channelAuthorization: {
        endpoint: "https://app.inboundless.co/api/realtime/pusher-auth",
        transport: "ajax",
        params: { orgId, sessionId },
      } as any,
    });

    pusherRef.current = pusher;

    const chanName = `presence-org_${orgId}_session_${sessionId}`;
    const ch = pusher.subscribe(chanName) as Channel;
    chanRef.current = ch;

    const onCursor = (payload: any) => {
      const c = coerceCursor(payload);
      if (c) setCursor(c);
    };

    const onInc = (payload: any) => {
      const events = (payload?.events ?? []) as eventWithTime[];
      if (events.length && onRrweb) onRrweb(events);
    };

    const onSnap = (payload: any) => {
      const events = (payload?.events ?? []) as eventWithTime[];
      if (events.length && onSnapshot) onSnapshot(events);
    };

    // ✅ bind cursor: client + fallback (au cas où)
    ch.bind("client-cursor", onCursor);
    ch.bind("cursor", onCursor);

    ch.bind("client-rrweb", onInc);
    ch.bind("client-snapshot", onSnap);

    // (optionnel) debug connexion
    const onConnected = () => {
      // console.log("[pusher] connected", chanName);
    };
    const onError = (e: any) => {
      console.error("[pusher] connection error", e);
    };
    pusher.connection.bind("connected", onConnected);
    pusher.connection.bind("error", onError);

    return () => {
      // stop rrweb côté visiteur
      fetch("/api/realtime/rrweb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, sessionId, action: "stop" }),
      }).catch(() => {});

      setCursor(null);

      try {
        ch.unbind("client-cursor", onCursor);
        ch.unbind("cursor", onCursor);
        ch.unbind("client-rrweb", onInc);
        ch.unbind("client-snapshot", onSnap);
        ch.unbind_all();
      } catch {}

      try {
        pusher.unsubscribe(chanName);
      } catch {}

      try {
        pusher.connection.unbind("connected", onConnected);
        pusher.connection.unbind("error", onError);
      } catch {}

      try {
        pusher.disconnect();
      } catch {}

      chanRef.current = null;
      pusherRef.current = null;
    };
  }, [orgId, sessionId, onRrweb, onSnapshot]);

  return { cursor };
}