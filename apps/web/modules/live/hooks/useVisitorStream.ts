// apps/web/modules/live/hooks/useVisitorStream.ts
"use client";

import { useEffect, useRef, useState } from "react";
import Pusher, { type Channel } from "pusher-js";
import type { Replayer } from "rrweb";
import type { eventWithTime } from "@rrweb/types";

export function useVisitorStream(opts: {
  orgId: string;
  sessionId: string;
  container: HTMLElement | null;
  replayer: Replayer | null;
}) {
  const { orgId, sessionId, container, replayer } = opts;
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const chanRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!container || !orgId || !sessionId) return;

    console.log("[stream] start", { orgId, sessionId, container });

    if (typeof window !== "undefined") {
      (Pusher as any).logToConsole = true;
    }

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      console.error("[stream] Missing NEXT_PUBLIC_PUSHER_KEY or CLUSTER");
      return;
    }

    const pusher = new Pusher(key, {
      cluster,
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

    ch.bind("client-rrweb", (payload: unknown) => {
      console.log("[stream] client-rrweb raw payload:", payload);

      if (!replayer) {
        console.log("[stream] replayer not ready yet, dropping event");
        return;
      }

      let events: eventWithTime[] | undefined;

      const maybePayload = payload as any;

      if (Array.isArray(maybePayload?.events)) {
        events = maybePayload.events as eventWithTime[];
      } else if (Array.isArray(maybePayload)) {
        events = maybePayload as eventWithTime[];
      } else if (maybePayload?.event) {
        events = [maybePayload.event as eventWithTime];
      } else if (typeof maybePayload?.data === "string") {
        try {
          const parsed = JSON.parse(maybePayload.data);
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

      events.forEach((ev) => replayer.addEvent(ev as any));
    });

    ch.bind("client-cursor", (p: { x: number; y: number }) => {
      setCursor(p);
    });

    return () => {
      ch.unbind_all();
      pusher.unsubscribe(chanName);
      pusher.disconnect();
    };
  }, [orgId, sessionId, container, replayer]);

  return { cursor };
}
