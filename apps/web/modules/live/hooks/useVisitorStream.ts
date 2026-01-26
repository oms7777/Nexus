// apps/web/modules/live/hooks/useVisitorStream.ts
"use client";

import { useEffect, useRef, useState } from "react";
import Pusher, { type Channel } from "pusher-js";
import type { eventWithTime } from "rrweb/typings/types";
import type { Id } from "@workspace/backend/_generated/dataModel";

type Cursor = { x: number; y: number };

export function useVisitorStream(opts: {
  orgId: string;
  sessionId: string | Id<"contactSessions">;
  onRrweb?: (events: eventWithTime[]) => void;
  onSnapshot?: (events: eventWithTime[]) => void;
  onPage?: (p: { href?: string; title?: string; ts?: number }) => void;
}) {
  const { orgId, sessionId, onRrweb, onSnapshot, onPage } = opts;

  const [cursor, setCursor] = useState<Cursor | null>(null);
  const chanRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!orgId || !sessionId) return;

    const sid = String(sessionId);

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

    const chanName = `presence-org_${orgId}_session_${sid}`;
    const ch = pusher.subscribe(chanName) as Channel;
    chanRef.current = ch;

    const onCursor = (p: Cursor) => setCursor(p);

    const onInc = (payload: any) => {
      const events = (payload?.events ?? []) as eventWithTime[];
      if (events.length) onRrweb?.(events);
    };

    const onSnap = (payload: any) => {
      const events = (payload?.events ?? []) as eventWithTime[];
      if (events.length) onSnapshot?.(events);
    };

    const onPg = (payload: any) => {
      onPage?.({
        href: payload?.href,
        title: payload?.title,
        ts: payload?.ts,
      });
    };

    ch.bind("client-cursor", onCursor);
    ch.bind("client-rrweb", onInc);
    ch.bind("client-snapshot", onSnap);
    ch.bind("client-page", onPg);

    return () => {
      try {
        ch.unbind("client-cursor", onCursor);
        ch.unbind("client-rrweb", onInc);
        ch.unbind("client-snapshot", onSnap);
        ch.unbind("client-page", onPg);
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
  }, [orgId, sessionId, onRrweb, onSnapshot, onPage]);

  return { cursor };
}