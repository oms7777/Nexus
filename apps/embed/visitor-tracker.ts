// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let channelRef: Channel | null = null;
let snapshotSent = false;

// On bufferise les events jusqu’au premier FullSnapshot
let snapshotBuffer: eventWithTime[] = [];

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string;
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";
const MAX_EVENT_BYTES = 9_000;

export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // ne jamais tracker dans l’iframe
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
          const isFullSnapshot = event.type === 2; // rrweb FullSnapshot

          // Tant que le snapshot n’est pas envoyé, on bufferise
          if (!snapshotSent) {
            snapshotBuffer.push(event);

            // Premier FullSnapshot → on envoie tout le buffer au backend
            if (isFullSnapshot) {
              snapshotSent = true;
              const snapshotEvents = [...snapshotBuffer];

              console.log(
                "[tracker] sending snapshot with",
                snapshotEvents.length,
                "events",
              );

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

              // on peut vider le buffer, il a été persisté
              snapshotBuffer = [];
            }

            // Tant que le snapshot n’est pas parti, on ne stream rien
            return;
          }

          // Une fois le snapshot envoyé :
          // - on NE push jamais les FullSnapshot vers Pusher
          if (isFullSnapshot) return;

          // - on envoie seulement les incrémentaux
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

    // Curseur live
    document.addEventListener("mousemove", (e) => {
      channel.trigger("client-cursor", {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    });
  });
}
