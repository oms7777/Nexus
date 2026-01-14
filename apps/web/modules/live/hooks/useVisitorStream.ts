"use client";

import { useEffect, useState } from "react";
import Pusher from "pusher-js";
import type { eventWithTime } from "@rrweb/types";
import type { Id } from "@workspace/backend/_generated/dataModel";

export function useVisitorStream({
  orgId,
  sessionId,
}: {
  orgId: string;
  sessionId: Id<"contactSessions">;
}) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [snapshotEvents, setSnapshotEvents] = useState<eventWithTime[] | null>(null);

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

    // ✅ SNAPSHOT DIRECT VIA PUSHER (NE DEPEND PLUS DE CONVEX)
    channel.bind("client-snapshot", (payload: { events?: eventWithTime[] }) => {
      if (Array.isArray(payload?.events) && payload.events.length) {
        setSnapshotEvents(payload.events);
      }
    });

    return () => {
      channel.unbind_all();
      pusher.disconnect();
    };
  }, [orgId, sessionId]);

  return { cursor, snapshotEvents };
}
