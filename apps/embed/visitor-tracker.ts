// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let channelRef: Channel | null = null;
let pusherRef: Pusher | null = null;

let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];

let stopRecording: (() => void) | null = null;
let stopFlushTimer: (() => void) | null = null;

// cursor
let stopCursor: (() => void) | null = null;

// Live batching
let liveQueue: eventWithTime[] = [];
let flushing = false;

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string;
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// Pusher limit ~10KB per client event -> keep margin
const MAX_EVENT_BYTES = 9_000;

// Flush cadence (batch)
const FLUSH_EVERY_MS = 250;

// Safety caps
const MAX_SNAPSHOT_BUFFER_EVENTS = 6_000;
const MAX_QUEUE_EVENTS = 1_500;

function safeBytes(str: string) {
  return new TextEncoder().encode(str).length;
}

function cleanup() {
  try {
    stopRecording?.();
  } catch {}
  stopRecording = null;

  try {
    stopFlushTimer?.();
  } catch {}
  stopFlushTimer = null;

  try {
    stopCursor?.();
  } catch {}
  stopCursor = null;

  try {
    channelRef?.unbind_all();
  } catch {}
  channelRef = null;

  try {
    pusherRef?.disconnect();
  } catch {}
  pusherRef = null;

  liveQueue = [];
  snapshotBuffer = [];
  snapshotSent = false;
  flushing = false;

  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // never track inside widget iframe
  if (window.self !== window.top) return;

  started = true;

  // ✅ MAJ: purge Pusher “transport memory” (cause classique de freeze)
  // Si Pusher a mémorisé xhr_streaming, ça peut créer une tempête de requêtes au refresh.
  try {
    window.localStorage.removeItem("pusherTransportTLS");
  } catch {}

  // ✅ MAJ: force WebSocket only (évite xhr_streaming / xhr_polling)
  const pusher = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    forceTLS: true,
    enabledTransports: ["ws", "wss"],
    disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],
    channelAuthorization: {
      endpoint: PUSHER_AUTH_URL,
      transport: "ajax",
    },
  });

  pusherRef = pusher;

  const channelName = `presence-org_${orgId}_session_${sessionId}`;
  const channel = pusher.subscribe(channelName);
  channelRef = channel;

  const flush = () => {
    if (!channelRef) return;
    if (!snapshotSent) return;
    if (flushing) return;
    if (liveQueue.length === 0) return;

    flushing = true;

    try {
      const chunk = liveQueue.splice(0, 120);
      const filtered = chunk.filter((e) => e.type !== 2); // never send FullSnapshot
      if (filtered.length === 0) {
        flushing = false;
        return;
      }

      const payload = { events: filtered };
      const json = JSON.stringify(payload);
      const bytes = safeBytes(json);

      // split progressively if too big
      if (bytes > MAX_EVENT_BYTES && filtered.length > 1) {
        liveQueue.unshift(...filtered);
        const half = Math.ceil(filtered.length / 2);
        const a = liveQueue.splice(0, half);
        const b = liveQueue.splice(0, half);
        liveQueue.unshift(...b);
        liveQueue.unshift(...a);
        flushing = false;
        return;
      }

      // If even one event too big → skip it
      if (bytes > MAX_EVENT_BYTES && filtered.length === 1) {
        flushing = false;
        return;
      }

      channelRef.trigger("client-rrweb", payload);
    } catch {
      // ignore
    } finally {
      flushing = false;
    }
  };

  const timer = window.setInterval(flush, FLUSH_EVERY_MS);
  stopFlushTimer = () => window.clearInterval(timer);

  channel.bind("pusher:subscription_succeeded", () => {
    // ✅ rrweb recording with sampling
    const stop: listenerHandler | undefined = record({
      sampling: {
        mousemove: 120,
        mouseInteraction: true,
        scroll: 150,
        input: "last",
      },
      emit(event: eventWithTime) {
        try {
          const isFullSnapshot = event.type === 2;

          if (!snapshotSent) {
            snapshotBuffer.push(event);
            if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER_EVENTS) {
              snapshotBuffer.splice(
                0,
                snapshotBuffer.length - MAX_SNAPSHOT_BUFFER_EVENTS,
              );
            }
          }

          if (isFullSnapshot && !snapshotSent) {
            snapshotSent = true;
            const snapshotEvents = [...snapshotBuffer];
            snapshotBuffer = [];

            fetch(SNAPSHOT_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                organizationId: orgId,
                sessionId,
                events: snapshotEvents,
              }),
            }).catch(() => {
              // best effort only
            });

            return; // don't enqueue FullSnapshot for live
          }

          if (!snapshotSent) return;
          if (isFullSnapshot) return;

          liveQueue.push(event);
          if (liveQueue.length > MAX_QUEUE_EVENTS) {
            liveQueue.splice(0, liveQueue.length - MAX_QUEUE_EVENTS);
          }
        } catch {
          // ignore
        }
      },
    });

    stopRecording = stop ? (() => stop()) : null;

    // ✅ MAJ: live cursor (throttled via RAF)
    let raf = 0;
    let lastX = 0;
    let lastY = 0;

    const onMove = (e: MouseEvent) => {
      if (!snapshotSent || !channelRef) return;

      lastX = e.clientX / window.innerWidth;
      lastY = e.clientY / window.innerHeight;

      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        if (!snapshotSent || !channelRef) return;
        channelRef.trigger("client-cursor", { x: lastX, y: lastY });
      });
    };

    document.addEventListener("mousemove", onMove, { passive: true });
    stopCursor = () => document.removeEventListener("mousemove", onMove);
  });

  channel.bind("pusher:subscription_error", () => {
    cleanup();
  });

  // bonus: si pusher se déconnecte, on nettoie pour éviter les loops “zombies”
  pusher.connection.bind("disconnected", () => {
    cleanup();
  });
}
