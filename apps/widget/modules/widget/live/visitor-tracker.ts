// apps/widget/modules/widget/live/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import Pusher from "pusher-js";

let started = false;

export function initVisitorTracking(orgId: string, sessionId: string) {
  if (started) return;
  started = true;

  const authUrl =
    process.env.NEXT_PUBLIC_PUSHER_AUTH_URL ||
    "/api/realtime/pusher-auth";

  const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    authEndpoint: authUrl,
    channelAuthorization: {
      endpoint: authUrl,
      transport: "ajax",
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
