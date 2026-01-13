// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "@rrweb/types";
import Pusher from "pusher-js";
import type { Channel } from "pusher-js";

let started = false;

let pusherRef: Pusher | null = null;
let channelRef: Channel | null = null;

// ✅ record() peut retourner undefined selon la version rrweb
let stopRecording: listenerHandler | undefined;

let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];

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

function purgePusherTransportCache() {
  try {
    localStorage.removeItem("pusherTransportTLS");
    localStorage.removeItem("pusherTransportNonTLS");
  } catch {
    // ignore
  }
}

function cleanup() {
  try {
    stopRecording?.();
  } catch {}
  stopRecording = undefined;

  try {
    channelRef?.unbind_all();
  } catch {}
  channelRef = null;

  try {
    pusherRef?.disconnect();
  } catch {}
  pusherRef = null;

  // reset state
  liveQueue = [];
  snapshotBuffer = [];
  snapshotSent = false;
  flushing = false;

  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

export function initVisitorTracking({
  orgId,
  sessionId,
}: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // never track inside widget iframe
  if (window.self !== window.top) return;

  started = true;

  purgePusherTransportCache();

  const pusher = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    forceTLS: true,

    // ✅ WS only
    enabledTransports: ["ws", "wss"],
    disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],

    channelAuthorization: {
      endpoint: PUSHER_AUTH_URL,
      transport: "ajax",
    },
  });

  pusherRef = pusher;

  const channelName = `presence-org_${orgId}_session_${sessionId}`;
  const channel = pusher.subscribe(channelName) as Channel;
  channelRef = channel;

  const flush = () => {
    if (!channelRef) return;
    if (!snapshotSent) return;
    if (flushing) return;
    if (liveQueue.length === 0) return;

    flushing = true;

    try {
      const chunk = liveQueue.splice(0, 120);

      // Never send FullSnapshot over Pusher
      const filtered = chunk.filter((e) => e.type !== 2);
      if (filtered.length === 0) return;

      const payload = { events: filtered };
      const json = JSON.stringify(payload);
      const bytes = safeBytes(json);

      // Split si trop gros
      if (bytes > MAX_EVENT_BYTES && filtered.length > 1) {
        liveQueue.unshift(...filtered);
        const half = Math.ceil(filtered.length / 2);

        const a = liveQueue.splice(0, half);
        const b = liveQueue.splice(0, half);

        liveQueue.unshift(...b);
        liveQueue.unshift(...a);
        return;
      }

      // Si un seul event trop gros -> skip
      if (bytes > MAX_EVENT_BYTES && filtered.length === 1) return;

      channelRef.trigger("client-rrweb", payload);
    } catch {
      // ignore
    } finally {
      flushing = false;
    }
  };

  const timer = window.setInterval(flush, FLUSH_EVERY_MS);

  channel.bind("pusher:subscription_succeeded", () => {
    // ✅ stopRecording peut être undefined selon rrweb
    stopRecording = record({
      sampling: {
        mousemove: 120,
        mouseInteraction: true,
        scroll: 150,
        input: "last",
      },
      emit(event: eventWithTime) {
        try {
          const isFullSnapshot = event.type === 2;

          // Buffer early events until snapshot is sent
          if (!snapshotSent) {
            snapshotBuffer.push(event);

            if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER_EVENTS) {
              snapshotBuffer.splice(
                0,
                snapshotBuffer.length - MAX_SNAPSHOT_BUFFER_EVENTS,
              );
            }
          }

          // First FullSnapshot -> send snapshot to backend
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
            }).catch(() => {});

            return; // do not enqueue the FullSnapshot for live
          }

          // until snapshot sent, no live streaming
          if (!snapshotSent) return;

          // never send FullSnapshot via pusher
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
  });

  channel.bind("pusher:subscription_error", () => {
    window.clearInterval(timer);
    cleanup();
  });

  pusher.connection.bind("disconnected", () => {
    window.clearInterval(timer);
    cleanup();
  });
}
