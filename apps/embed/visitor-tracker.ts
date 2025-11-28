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

// 🔑 Clés publiques Pusher
const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// Taille maxi pour un event envoyé en live via Pusher
const MAX_EVENT_BYTES = 9_000;

export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // Ne jamais tracker l’iframe du widget
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
    },
  });

  const channelName = `presence-org_${orgId}_session_${sessionId}`;
  const channel = pusher.subscribe(channelName);
  channelRef = channel;

  channel.bind("pusher:subscription_succeeded", () => {
    console.log("[tracker] subscribed:", channelName);

    // 🎥 Enregistrement rrweb côté VISITEUR
    record({
      emit(event: eventWithTime) {
        try {
          const isSnapshot = event.type === 2; // full snapshot

          // 1️⃣ Snapshot → backend UNE SEULE FOIS
          if (isSnapshot && !snapshotSent) {
            snapshotSent = true;

            fetch(SNAPSHOT_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                organizationId: orgId,
                sessionId,
                events: [event],
              }),
            }).catch((err) =>
              console.error("[tracker] snapshot send failed", err),
            );
          }

          // ❌ On NE push JAMAIS le snapshot dans Pusher
          if (isSnapshot) return;

          // 2️⃣ Live events (petits) → Pusher
          const payload = { events: [event] };
          const size = JSON.stringify(payload).length;

          if (size > MAX_EVENT_BYTES) {
            console.warn("[tracker] event too large skipped", {
              size,
              type: event.type,
            });
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
