// apps/web/modules/live/hooks/useVisitorStream.ts
"use client";

import { useEffect, useRef, useState } from "react";
import Pusher, { type Channel } from "pusher-js";
import type { eventWithTime } from "@rrweb/types";

export function useVisitorStream(opts: {
  orgId: string;
  sessionId: string;
  container: HTMLElement | null;
  onEvents: (events: eventWithTime[]) => void;
}) {
  const { orgId, sessionId, container, onEvents } = opts;
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const chanRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!container || !orgId || !sessionId) {
      console.log("[stream] waiting for container", {
        hasContainer: !!container,
      });
      return;
    }

    console.log("[stream] start", { orgId, sessionId, container });

    if (typeof window !== "undefined") {
      (Pusher as any).logToConsole = true;
    }

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

    if (typeof window !== "undefined") {
      (window as any).__inboundlessStreamChannel = ch;
    }

    ch.bind("pusher:subscription_succeeded", () => {
      console.log("[stream] subscription_succeeded");
    });

    ch.bind("client-rrweb", (payload: any) => {
      console.log("[stream] client-rrweb raw payload:", payload);

      let events: eventWithTime[] | undefined;

      if (Array.isArray(payload?.events)) {
        events = payload.events as eventWithTime[];
      } else if (Array.isArray(payload)) {
        events = payload as eventWithTime[];
      } else if (payload?.event) {
        events = [payload.event as eventWithTime];
      } else if (typeof payload?.data === "string") {
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

      onEvents(events);
    });

    ch.bind("client-cursor", (p: { x: number; y: number }) => {
      setCursor(p);
    });

    return () => {
      ch.unbind_all();
      pusher.unsubscribe(chanName);
      pusher.disconnect();
    };
  }, [orgId, sessionId, container]); // ❗ onEvents PAS dans les deps

  return { cursor };
}
