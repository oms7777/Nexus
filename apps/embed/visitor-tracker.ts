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

// 🔑 Clés publiques Pusher (ok côté client)
const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";

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

  const pusher = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    forceTLS: true,
    channelAuthorization: {
      endpoint: PUSHER_AUTH_URL,
      transport: "ajax",
      // params: { orgId, sessionId }, // tu peux l’ajouter si tu veux
    },
  });

  const channelName = `presence-org_${orgId}_session_${sessionId}`;
  const channel = pusher.subscribe(channelName);
  channelRef = channel;

  channel.bind("pusher:subscription_succeeded", () => {
    console.log("[tracker] subscribed:", channelName);

    // 🎥 rrweb côté VISITEUR
    record({
      emit(event: eventWithTime) {
        try {
          // 1️⃣ Snapshot → envoyé UNE FOIS au backend
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

          // 2️⃣ Live events → Pusher (client-rrweb)
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

    // 🖱 Curseur live
    document.addEventListener("mousemove", (e) => {
      channel.trigger("client-cursor", {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    });
  });
}
