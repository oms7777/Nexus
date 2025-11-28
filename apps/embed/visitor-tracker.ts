// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let channelRef: Channel | null = null;
let snapshotSent = false;

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string;
};

export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // ❌ ne jamais tracker dans l’iframe
  if (window.self !== window.top) {
    console.log("[tracker] iframe detected – skipping");
    return;
  }

  started = true;
  console.log("[tracker] START (host page)", { orgId, sessionId });

  const pusherKey = import.meta.env.VITE_PUSHER_KEY;
  const pusherCluster = import.meta.env.VITE_PUSHER_CLUSTER;

  if (!pusherKey || !pusherCluster) {
    console.error("[tracker] Missing VITE_PUSHER_KEY or VITE_PUSHER_CLUSTER in embed env");
    return;
  }

  const pusher = new Pusher(pusherKey, {
    cluster: pusherCluster,
    authEndpoint: "https://app.inboundless.co/api/realtime/pusher-auth",
    channelAuthorization: {
      endpoint: "https://app.inboundless.co/api/realtime/pusher-auth",
      transport: "ajax",
    },
    forceTLS: true,
  });

  const channelName = `presence-org_${orgId}_session_${sessionId}`;
  const channel = pusher.subscribe(channelName);
  channelRef = channel;

  channel.bind("pusher:subscription_succeeded", () => {
    console.log("[tracker] subscribed:", channelName);

    record({
      emit(event: eventWithTime) {
        try {
          // ✅ 1. Snapshot envoyé une seule fois au backend
          if (event.type === 2 && !snapshotSent) {
            snapshotSent = true;

            fetch("https://app.inboundless.co/api/tracker/snapshot", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                organizationId: orgId,
                sessionId,
                events: [event],
              }),
            }).catch((err) =>
              console.error("[tracker] snapshot send failed", err)
            );
          }

          // ✅ 2. Tous les events (y compris snapshot) → Pusher
          const payload = { events: [event] };
          const size = JSON.stringify(payload).length;

          if (size > 9000) {
            console.warn("[tracker] event too large skipped");
            return;
          }

          channel.trigger("client-rrweb", payload);
        } catch (err) {
          console.error("[tracker] emit error", err);
        }
      },
    });

    // ✅ Curseur live
    document.addEventListener("mousemove", (e) => {
      channel.trigger("client-cursor", {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    });
  });
}
