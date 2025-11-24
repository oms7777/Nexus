// apps/widget/modules/widget/live/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import Pusher from "pusher-js";

let started = false;

export function initVisitorTracking(orgId: string, sessionId: string) {
  if (started) return;
  started = true;

  if (typeof window !== "undefined") {
    // debug Pusher côté visiteur
    (Pusher as any).logToConsole = true;
  }

  console.log("[tracker] initVisitorTracking", { orgId, sessionId });

  const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    authEndpoint: "https://widget.inboundless.co/api/realtime/pusher-auth",
    channelAuthorization: {
      endpoint: "https://widget.inboundless.co/api/realtime/pusher-auth",
      transport: "ajax",
    },
    forceTLS: true,
  });

  const channelName = `presence-org_${orgId}_session_${sessionId}`;
  const channel = pusher.subscribe(channelName);

  // pour debug depuis la console du widget (iframe)
  if (typeof window !== "undefined") {
    (window as any).__inboundlessVisitorChannel = channel;
  }

  channel.bind("pusher:subscription_succeeded", () => {
    console.log("[tracker] subscribing to", channelName);

    // 🔔 petit ping de test
    channel.trigger("client-ping", {
      from: "visitor",
      at: Date.now(),
    });

    // On ne démarre rrweb qu’après la subscription, pour éviter de perdre des events
    record({
      emit(event: eventWithTime) {
        console.log("[tracker] rrweb event", event.type, event);
        channel.trigger("client-rrweb", { events: [event] });
      },
    });

    // curseur
    document.addEventListener("mousemove", (e) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      channel.trigger("client-cursor", { x, y });
    });
  });
}
