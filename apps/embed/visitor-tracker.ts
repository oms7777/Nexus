// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let channelRef: Channel | null = null;
let snapshotSent = false;

// Buffer de tous les events au début pour construire un snapshot complet
let snapshotBuffer: eventWithTime[] = [];

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string;
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// Limite Pusher ≈ 10 Ko par event client → on reste un peu en dessous
const MAX_EVENT_BYTES = 9_000;

export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // Ne jamais tracker dans l’iframe du widget
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

    record({
      emit(event: eventWithTime) {
        try {
          const isFullSnapshot = event.type === 2;

          // On empile tous les events (y compris le FullSnapshot)
          snapshotBuffer.push(event);

          // 1️⃣ Premier FullSnapshot → on envoie TOUT le buffer au backend
          if (isFullSnapshot && !snapshotSent) {
            snapshotSent = true;

            const snapshotEvents = [...snapshotBuffer];

            console.log("[tracker] sending snapshot with", snapshotEvents.length, "events");

            fetch(SNAPSHOT_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                organizationId: orgId,
                sessionId,
                events: snapshotEvents,
              }),
            }).catch((err) =>
              console.error("[tracker] snapshot send failed", err),
            );

            // On garde le buffer tel quel (sert à replayer, rien de grave)
            snapshotBuffer = snapshotEvents;
          }

          // Tant que le snapshot complet n’est pas persisté, on ne stream rien.
          if (!snapshotSent) return;

          // On ne push JAMAIS les FullSnapshot dans Pusher (trop gros, pas utile)
          if (isFullSnapshot) return;

          // 2️⃣ Live events incrémentaux → Pusher
          const payload = { events: [event] };
          const size = JSON.stringify(payload).length;

          if (size > MAX_EVENT_BYTES) {
            // Ce warning concerne uniquement le stream live,
            // le snapshot complet est DEJA envoyé au backend.
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

    // Curseur live
    //document.addEventListener("mousemove", (e) => {
      //channel.trigger("client-cursor", {
        //x: e.clientX / window.innerWidth,
        //y: e.clientY / window.innerHeight,
      //});
    //});
  });
}
