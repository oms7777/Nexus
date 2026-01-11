// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let channelRef: Channel | null = null;

// rrweb record() return type varie selon versions (listenerHandler | undefined)
let stopRecording: ReturnType<typeof record> | null = null;

let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];

// (Optionnel) cursor live — désactivé par défaut pour éviter toute charge inutile
const CURSOR_ENABLED = false;

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string;
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// Limite Pusher ≈ 10 Ko par event client
const MAX_EVENT_BYTES = 9_000;

export function stopVisitorTracking() {
  try {
    if (typeof stopRecording === "function") stopRecording();
  } catch {}
  stopRecording = null;

  channelRef = null;
  started = false;

  snapshotSent = false;
  snapshotBuffer = [];
}

export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // Ne jamais tracker dans l’iframe du widget
  if (window.self !== window.top) {
    console.log("[tracker] iframe detected – skipping");
    return;
  }

  started = true;
  snapshotSent = false;
  snapshotBuffer = [];

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

    // rrweb recording
    stopRecording = record({
      emit(event: eventWithTime) {
        try {
          const isFullSnapshot = event.type === 2;

          // ✅ 1) Tant qu’on n’a PAS envoyé le snapshot, on bufferise
          if (!snapshotSent) {
            snapshotBuffer.push(event);

            // 1er FullSnapshot => on envoie tout le buffer
            if (isFullSnapshot) {
              snapshotSent = true;

              const snapshotEvents = snapshotBuffer;
              console.log("[tracker] sending snapshot with", snapshotEvents.length, "events");

              // ⚠️ Important : on FIRE & FORGET
              fetch(SNAPSHOT_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  organizationId: orgId,
                  sessionId,
                  events: snapshotEvents,
                }),
              }).catch((err) => console.error("[tracker] snapshot send failed", err));

              // ✅ Fix mémoire: on vide le buffer (sinon memory leak)
              snapshotBuffer = [];
            }

            // Tant que snapshot pas envoyé, on ne stream rien
            return;
          }

          // ✅ 2) Après snapshot: on ne bufferise PLUS JAMAIS

          // On ne push jamais les FullSnapshot via Pusher
          if (isFullSnapshot) return;

          // Live event incrémental
          const payload = { events: [event] };
          const size = JSON.stringify(payload).length;

          if (size > MAX_EVENT_BYTES) {
            console.warn("[tracker] event too large skipped", { size, type: event.type });
            return;
          }

          channel.trigger("client-rrweb", payload);
        } catch (err) {
          console.error("[tracker] emit error", err);
        }
      },
    });

    // Cursor live (désactivé par défaut)
    if (CURSOR_ENABLED) {
      let rafPending = false;
      let lastX = 0;
      let lastY = 0;

      document.addEventListener("mousemove", (e) => {
        lastX = e.clientX / window.innerWidth;
        lastY = e.clientY / window.innerHeight;

        if (rafPending) return;
        rafPending = true;

        requestAnimationFrame(() => {
          rafPending = false;
          channel.trigger("client-cursor", { x: lastX, y: lastY });
        });
      });
    }
  });
}
