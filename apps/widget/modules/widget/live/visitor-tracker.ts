import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import Pusher from "pusher-js";

let started = false;

export function initVisitorTracking(orgId: string, sessionId: string) {
  if (started) return;
  started = true;

  const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    channelAuthorization: {
      endpoint: process.env.NEXT_PUBLIC_PUSHER_AUTH_URL!, // https://app.inboundless.co/api/realtime/pusher-auth
      transport: "ajax",
      params: { orgId, sessionId }, // facultatif mais pratique pour les logs
    },
    forceTLS: true,
  });

  const channelName = `presence-org_${orgId}_session_${sessionId}`;
  const channel = pusher.subscribe(channelName);

  record({
    emit(event: eventWithTime) {
      channel.trigger("client-rrweb", { events: [event] });
    },
  });

  document.addEventListener("mousemove", (e) => {
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    channel.trigger("client-cursor", { x, y });
  });
}
