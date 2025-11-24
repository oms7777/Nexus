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
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const repRef = useRef<Replayer | null>(null);
  const chanRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!container || !orgId || !sessionId) return;

    console.log("[stream] start", { orgId, sessionId, container });

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      authEndpoint: "https://app.inboundless.co/api/realtime/pusher-auth",
      channelAuthorization: {
        endpoint: "https://app.inboundless.co/api/realtime/pusher-auth",
        transport: "ajax",
      },
      forceTLS: true,
    });

    const chanName = `presence-org_${orgId}_session_${sessionId}`;
    const ch = pusher.subscribe(chanName) as Channel;
    chanRef.current = ch;

    ch.bind("pusher:subscription_succeeded", () => {
      console.log("[stream] subscription_succeeded");
    });

    // rrweb live replayer
    repRef.current = new Replayer([], { liveMode: true, root: container });
    repRef.current.startLive();

    ch.bind("client-rrweb", (payload: any) => {
      console.log("[stream] client-rrweb raw payload:", payload);

      let events: eventWithTime[] | undefined;

      // 1) cas { events: [...] }
      if (Array.isArray(payload?.events)) {
        events = payload.events as eventWithTime[];
      }
      // 2) cas déjà tableau
      else if (Array.isArray(payload)) {
        events = payload as eventWithTime[];
      }
      // 3) cas { event: {...} }
      else if (payload?.event) {
        events = [payload.event as eventWithTime];
      }
      // 4) cas { data: "json" } (au cas où)
      else if (typeof payload?.data === "string") {
        try {
          const parsed = JSON.parse(payload.data);
          if (Array.isArray(parsed?.events)) {
            events = parsed.events as eventWithTime[];
          }
        } catch {
          // ignore
        }
      }

      if (!events || !events.length) {
        console.log("[stream] no usable events in payload");
        return;
      }

      events.forEach((ev) => repRef.current?.addEvent(ev as any));
    });

    ch.bind("client-cursor", (p: { x: number; y: number }) => {
      setCursor(p);
    });

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
