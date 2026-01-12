// apps/web/modules/live/hooks/useVisitorStream.ts
"use client";

import { useEffect, useRef, useState } from "react";
import Pusher, { type Channel } from "pusher-js";

export function useVisitorStream(opts: { orgId: string; sessionId: string }) {
  const { orgId, sessionId } = opts;
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const chanRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!orgId || !sessionId) return;

    // ✅ Purge du transport cache (cause principale du freeze au refresh)
    try {
      localStorage.removeItem("pusherTransportTLS");
      localStorage.removeItem("pusherTransportNonTLS");
    } catch {}

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      forceTLS: true,

      // ✅ IMPORTANT: jamais de xhr_streaming / xhr_polling
      enabledTransports: ["ws", "wss"],
      disabledTransports: ["xhr_streaming", "xhr_polling"],

      authEndpoint: "https://app.inboundless.co/api/realtime/pusher-auth",
      channelAuthorization: {
        endpoint: "https://app.inboundless.co/api/realtime/pusher-auth",
        transport: "ajax",
      },
    });

    const chanName = `presence-org_${orgId}_session_${sessionId}`;
    const ch = pusher.subscribe(chanName) as Channel;
    chanRef.current = ch;

    if (typeof window !== "undefined") {
      (window as any).__inboundlessStreamChannel = ch;
    }

    ch.bind("pusher:subscription_succeeded", () => {
      console.log("[stream] subscription_succeeded", chanName);
    });

    ch.bind("pusher:subscription_error", (status: any) => {
      console.warn("[stream] subscription_error", status);
    });

    // Live cursor
    ch.bind("client-cursor", (p: { x: number; y: number }) => {
      setCursor(p);
    });

    // Debug rrweb events if needed
    ch.bind("client-rrweb", (payload: any) => {
      // console.log("[stream] client-rrweb raw payload:", payload);
    });

    return () => {
      try {
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
  }, [orgId, sessionId]);

  return { cursor };
}
