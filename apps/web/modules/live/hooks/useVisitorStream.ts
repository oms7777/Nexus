// apps/web/modules/live/hooks/useVisitorStream.ts
"use client";
import { useEffect, useRef, useState } from "react";
import Pusher, { type Channel } from "pusher-js";
import { Replayer } from "rrweb";
import type { eventWithTime } from "@rrweb/types";

export function useVisitorStream(opts: {
  orgId: string;
  sessionId: string;
  container: HTMLElement | null;
}) {
  const { orgId, sessionId, container } = opts;
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(
    null,
  );
  const repRef = useRef<Replayer | null>(null);
  const chanRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!container || !orgId || !sessionId) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      authEndpoint: "/api/realtime/pusher-auth",
      channelAuthorization: {
        endpoint: "/api/realtime/pusher-auth",
        transport: "ajax",
      },
      forceTLS: true,
    });


    const chanName = `presence-org_${orgId}_session_${sessionId}`;
    const ch = pusher.subscribe(chanName) as Channel;
    chanRef.current = ch;

    repRef.current = new Replayer([], {
      liveMode: true,
      root: container,
    });
    repRef.current.startLive();

    ch.bind("client-rrweb", (payload: { events: eventWithTime[] }) => {
      payload.events.forEach((ev) => repRef.current?.addEvent(ev as any));
    });

    ch.bind("client-cursor", (p: { x: number; y: number }) =>
      setCursor(p),
    );

    return () => {
      ch.unbind_all();
      pusher.unsubscribe(chanName);
      pusher.disconnect();
      repRef.current?.pause();
      repRef.current = null;
      chanRef.current = null;
    };
  }, [orgId, sessionId, container]);

  return { cursor };
}
