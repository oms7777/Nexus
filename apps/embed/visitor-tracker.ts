// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let channelRef: Channel | null = null;

// rrweb record() return type varie selon versions (listenerHandler | undefined)
let stopRecording: ReturnType<typeof record> | null = null;

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string;
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// Batching live events
const BATCH_MS = 250;
const MAX_BATCH_EVENTS = 40; // garde ça bas
const MAX_PAYLOAD_BYTES = 9_000; // limite pusher ~10kb

// Désactivé par défaut (le curseur peut être très bruyant)
const CURSOR_ENABLED = false;

export function stopVisitorTracking() {
  try {
    if (typeof stopRecording === "function") stopRecording();
  } catch {}
  stopRecording = null;

  channelRef = null;
  started = false;
}

export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // Ne jamais tracker dans l’iframe du widget
  if (window.self !== window.top) return;

  // Kill-switch simple en prod si besoin :
  // window.__NEXUS_DISABLE_TRACKING__ = true
  if ((window as any).__NEXUS_DISABLE_TRACKING__ === true) return;

  started = true;

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
    let snapshotSent = false;

    // buffer batch pour le live (après snapshot)
    let liveBuffer: eventWithTime[] = [];
    let liveTimer: number | null = null;

    const flushLive = () => {
      liveTimer = null;
      if (!snapshotSent) return;
      if (!channelRef) return;
      if (liveBuffer.length === 0) return;

      const payload = { events: liveBuffer };
      liveBuffer = [];

      // ⚠️ stringify uniquement au flush, pas à chaque event
      const str = JSON.stringify(payload);
      if (str.length > MAX_PAYLOAD_BYTES) {
        // si trop gros, on split en petits paquets
        // (simple split)
        const events = payload.events;
        for (let i = 0; i < events.length; i += 10) {
          const chunk = { events: events.slice(i, i + 10) };
          const chunkStr = JSON.stringify(chunk);
          if (chunkStr.length <= MAX_PAYLOAD_BYTES) {
            channelRef.trigger("client-rrweb", chunk);
          }
        }
        return;
      }

      channelRef.trigger("client-rrweb", payload);
    };

    const scheduleFlush = () => {
      if (liveTimer != null) return;
      liveTimer = window.setTimeout(flushLive, BATCH_MS);
    };

    stopRecording = record({
      emit(event: eventWithTime) {
        try {
          const isFullSnapshot = event.type === 2;

          // 1) Snapshot : on envoie uniquement le FullSnapshot
          if (!snapshotSent) {
            if (!isFullSnapshot) {
              // ignore tout avant le snapshot
              return;
            }

            snapshotSent = true;

            // IMPORTANT: stringify + fetch hors du callstack actuel
            // pour éviter de bloquer au pire moment.
            setTimeout(() => {
              fetch(SNAPSHOT_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  organizationId: orgId,
                  sessionId,
                  events: [event], // ✅ only full snapshot
                }),
              }).catch(() => {});
            }, 0);

            return;
          }

          // 2) Après snapshot : on ignore les FullSnapshot
          if (isFullSnapshot) return;

          // 3) Live buffering + flush
          liveBuffer.push(event);

          // hard cap, sinon tu peux re-freeze
          if (liveBuffer.length >= MAX_BATCH_EVENTS) {
            flushLive();
            return;
          }

          scheduleFlush();
        } catch {
          // no-op
        }
      },
    });

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
