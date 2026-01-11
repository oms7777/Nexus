// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let channelRef: Channel | null = null;
let snapshotSent = false;
let stopRecording: ReturnType<typeof record> | null = null;

// Buffer UNIQUEMENT avant le premier FullSnapshot
let snapshotBuffer: eventWithTime[] = [];

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

// Throttle live stream pour éviter de spammer CPU/network
const LIVE_FLUSH_MS = 120;
let liveQueue: eventWithTime[] = [];
let liveTimer: any = null;

function flushLive(channel: Channel) {
  liveTimer = null;
  if (!liveQueue.length) return;

  const batch = liveQueue;
  liveQueue = [];

  try {
    const payload = { events: batch };
    const size = JSON.stringify(payload).length;

    // Si batch trop gros, on split (simple)
    if (size > MAX_EVENT_BYTES) {
      for (const ev of batch) {
        const one = { events: [ev] };
        const oneSize = JSON.stringify(one).length;
        if (oneSize <= MAX_EVENT_BYTES) {
          channel.trigger("client-rrweb", one);
        }
      }
      return;
    }

    channel.trigger("client-rrweb", payload);
  } catch (err) {
    console.error("[tracker] flushLive error", err);
  }
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
  liveQueue = [];
  if (liveTimer) clearTimeout(liveTimer);
  liveTimer = null;

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

    // ✅ IMPORTANT: sampling = réduit massivement la charge
    stopRecording = record({
      sampling: {
        // réduit le flux
        mousemove: 200,
        mouseInteraction: true,
        scroll: 150,
        input: "last",
      },
      emit(event: eventWithTime) {
        try {
          const isFullSnapshot = event.type === 2;

          // Buffer seulement tant qu’on n’a pas envoyé le snapshot
          if (!snapshotSent) {
            snapshotBuffer.push(event);

            if (isFullSnapshot) {
              snapshotSent = true;

              const snapshotEvents = snapshotBuffer;
              snapshotBuffer = []; // ✅ PURGE => plus de mémoire qui grossit

              console.log("[tracker] sending snapshot with", snapshotEvents.length, "events");

              fetch(SNAPSHOT_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  organizationId: orgId,
                  sessionId,
                  events: snapshotEvents,
                }),
              }).catch((err) => console.error("[tracker] snapshot send failed", err));

              // Après snapshot, on ne stream pas ce FullSnapshot
              return;
            }

            // tant que le snapshot n'est pas envoyé → on ne stream rien
            return;
          }

          // Après snapshot: ne jamais envoyer FullSnapshot en live
          if (isFullSnapshot) return;

          // Queue live + throttle
          liveQueue.push(event);
          if (!liveTimer) {
            liveTimer = setTimeout(() => flushLive(channel), LIVE_FLUSH_MS);
          }
        } catch (err) {
          console.error("[tracker] emit error", err);
        }
      },
    });

    // ❌ Cursor live désactivé (source de spam énorme)
    // document.addEventListener("mousemove", ...)
  });

  channel.bind("pusher:subscription_error", (e: any) => {
    console.warn("[tracker] subscription_error", e);
  });
}

// Optionnel si tu veux pouvoir arrêter proprement plus tard
export function stopVisitorTracking() {
  try {
    if (typeof stopRecording === "function") stopRecording();
  } catch {}
  stopRecording = null;

  channelRef = null;
  started = false;
  snapshotSent = false;
  snapshotBuffer = [];
  liveQueue = [];
  if (liveTimer) clearTimeout(liveTimer);
  liveTimer = null;
}
