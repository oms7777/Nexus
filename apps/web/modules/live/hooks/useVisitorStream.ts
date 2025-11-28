// apps/web/modules/live/hooks/useVisitorStream.ts
"use client";

import { useEffect, useRef, useState } from "react";
import Pusher, { type Channel } from "pusher-js";

export function useVisitorStream(opts: {
  orgId: string;
  sessionId: string;
}) {
  const { orgId, sessionId } = opts;
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const chanRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!orgId || !sessionId) return;

    console.log("[stream] start", { orgId, sessionId });

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

    // Live cursor
    ch.bind("client-cursor", (p: { x: number; y: number }) => {
      setCursor(p);
    });

    // On log juste les events rrweb pour debug (le Replayer les consommera via Convex)
    ch.bind("client-rrweb", (payload: any) => {
      console.log("[stream] client-rrweb raw payload:", payload);
    });

    return () => {
      ch.unbind_all();
      pusher.unsubscribe(chanName);
      pusher.disconnect();
    };
  }, [orgId, sessionId]);

  return { cursor };
}
