"use client";

import { useEffect, useState } from "react";
import Pusher from "pusher-js";

export function useVisitorStream({
  orgId,
  sessionId,
}: {
  orgId: string;
  sessionId: string;
}) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!orgId || !sessionId) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      forceTLS: true,
      enabledTransports: ["ws", "wss"],
      disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],
      authEndpoint: "https://app.inboundless.co/api/realtime/pusher-auth",
    });

    const channelName = `presence-org_${orgId}_session_${sessionId}`;
    const channel = pusher.subscribe(channelName);

    channel.bind("client-cursor", setCursor);

    return () => {
      channel.unbind_all();
      pusher.disconnect();
    };
  }, [orgId, sessionId]);

  return { cursor };
}
