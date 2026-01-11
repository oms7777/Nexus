// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let channelRef: Channel | null = null;
let snapshotSent = false;

// Buffer uniquement jusqu'au premier FullSnapshot, puis on libère la mémoire
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

/** =========================
 *  Cursor: mode A (fluide)
 *  - envoi ~60fps via rAF (mais 1 seul trigger par frame)
 *  - pas de spam sur chaque mousemove
 *  ========================= */
function setupLiveCursor(channel: Channel) {
  let lastX = 0;
  let lastY = 0;
  let hasMove = false;
  let rafId: number | null = null;

  const onMove = (e: MouseEvent) => {
    // stocke uniquement la dernière position
    lastX = e.clientX / window.innerWidth;
    lastY = e.clientY / window.innerHeight;
    hasMove = true;
  };

  const loop = () => {
    // Envoie au max 1 update par frame
    if (hasMove) {
      hasMove = false;
      try {
        channel.trigger("client-cursor", { x: lastX, y: lastY });
      } catch {
        // ignore
      }
    }
    rafId = window.requestAnimationFrame(loop);
  };

  document.addEventListener("mousemove", onMove, { passive: true });
  rafId = window.requestAnimationFrame(loop);

  return () => {
    document.removeEventListener("mousemove", onMove);
    if (rafId !== null) window.cancelAnimationFrame(rafId);
  };
}

/** =========================
 *  RRWeb streaming: batching
 *  - on ne fait PAS JSON.stringify sur chaque event
 *  - on batch et on stringify une fois au flush
 *  - si payload trop gros => split
 *  ========================= */
function setupRrwebStreaming(channel: Channel, orgId: string, sessionId: string) {
  // events live (incremental) en attente
  let queue: eventWithTime[] = [];
  let flushTimer: number | null = null;

  // flush toutes les 120ms (équilibre perf / "live feel")
  const FLUSH_MS = 120;

  const scheduleFlush = () => {
    if (flushTimer !== null) return;
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      flushQueue();
    }, FLUSH_MS);
  };

  const safeTrigger = (events: eventWithTime[]) => {
    if (!events.length) return;

    // stringify une fois par envoi (pas par event)
    let payloadStr = "";
    try {
      payloadStr = JSON.stringify({ events });
    } catch (e) {
      console.error("[tracker] stringify failed", e);
      return;
    }

    // si c'est trop gros, on split (simple, robuste)
    if (payloadStr.length > MAX_EVENT_BYTES) {
      if (events.length === 1) {
        console.warn("[tracker] event too large skipped", {
          size: payloadStr.length,
          type: events[0]?.type,
        });
        return;
      }

      const mid = Math.floor(events.length / 2);
      safeTrigger(events.slice(0, mid));
      safeTrigger(events.slice(mid));
      return;
    }

    try {
      channel.trigger("client-rrweb", { events });
    } catch (e) {
      console.error("[tracker] pusher trigger error", e);
    }
  };

  const flushQueue = () => {
    if (!queue.length) return;

    // On envoie par chunks raisonnables
    const batch = queue;
    queue = [];

    safeTrigger(batch);
  };

  record({
    emit(event: eventWithTime) {
      try {
        const isFullSnapshot = event.type === 2;

        // On buffer uniquement jusqu'au FullSnapshot
        if (!snapshotSent) {
          snapshotBuffer.push(event);

          if (isFullSnapshot) {
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
            }).catch((err) => console.error("[tracker] snapshot send failed", err));

            // ✅ libère la mémoire: on n'a plus besoin du buffer complet
            snapshotBuffer = [];

            // Une fois snapshot envoyé, on peut commencer le live
            return;
          }

          // Tant que snapshot pas envoyé, on ne stream rien
          return;
        }

        // Après snapshot: ne jamais pousser FullSnapshot dans Pusher
        if (isFullSnapshot) return;

        // Queue + flush batch (1 stringify au flush)
        queue.push(event);
        scheduleFlush();
      } catch (err) {
        console.error("[tracker] emit error", err);
      }
    },
  });

  return () => {
    if (flushTimer !== null) window.clearTimeout(flushTimer);
    flushTimer = null;
    queue = [];
  };
}

/** =========================
 *  Main entry
 *  ========================= */
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

    // 1) rrweb streaming (batch)
    const teardownStream = setupRrwebStreaming(channel, orgId, sessionId);

    // 2) cursor live (A: fluide via rAF)
    const teardownCursor = setupLiveCursor(channel);

    // (Optionnel) cleanup si tu ajoutes un destroy plus tard
    // (window as any).__nexusTrackerTeardown = () => {
    //   teardownCursor();
    //   teardownStream();
    //   pusher.unsubscribe(channelName);
    //   pusher.disconnect();
    // };
  });
}
