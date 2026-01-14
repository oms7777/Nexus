// ✅ apps/embed/visitor-tracker.ts  (PUSHER ONLY — no backend route)
import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;

let pusherRef: Pusher | null = null;
let channelRef: Channel | null = null;

let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];

let stopRecording: (() => void) | null = null;
let stopFlushTimer: (() => void) | null = null;

// Live batching
let liveQueue: eventWithTime[] = [];
let flushing = false;

// Cursor live
let cursorRaf = 0;
let cursorAttached = false;
let lastCursorX = 0;
let lastCursorY = 0;
let lastCursorSentAt = 0;

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string;
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";

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

function detachCursor() {
  if (!cursorAttached) return;
  cursorAttached = false;

  try {
    if (cursorRaf) cancelAnimationFrame(cursorRaf);
  } catch {}
  cursorRaf = 0;

  try {
    document.removeEventListener("mousemove", onMouseMove as any);
  } catch {}
}

function cleanup() {
  detachCursor();

  try {
    stopRecording?.();
  } catch {}
  stopRecording = null;

  try {
    stopFlushTimer?.();
  } catch {}
  stopFlushTimer = null;

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

function onMouseMove(e: MouseEvent) {
  lastCursorX = Math.max(0, Math.min(1, e.clientX / window.innerWidth));
  lastCursorY = Math.max(0, Math.min(1, e.clientY / window.innerHeight));
}

function attachCursor() {
  if (cursorAttached) return;
  cursorAttached = true;

  document.addEventListener("mousemove", onMouseMove, { passive: true });

  const loop = () => {
    cursorRaf = requestAnimationFrame(loop);

    if (!snapshotSent) return;
    if (!channelRef) return;

    const now = Date.now();
    if (now - lastCursorSentAt < 80) return; // ~12fps
    lastCursorSentAt = now;

    try {
      channelRef.trigger("client-cursor", { x: lastCursorX, y: lastCursorY });
    } catch {}
  };

  cursorRaf = requestAnimationFrame(loop);
}

export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // never track inside widget iframe
  if (window.self !== window.top) return;

  try {
    localStorage.removeItem("pusherTransportTLS");
    localStorage.removeItem("pusherTransportNonTLS");
  } catch {}

  if (!orgId || !sessionId) return;
  started = true;

  const pusher = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    forceTLS: true,
    disableStats: true,
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

      // never send FullSnapshot in live batches
      const filtered = chunk.filter((e) => e.type !== 2);
      if (filtered.length === 0) return;

      const payload = { events: filtered };
      const json = JSON.stringify(payload);
      const bytes = safeBytes(json);

      // too big -> requeue and let next ticks split
      if (bytes > MAX_EVENT_BYTES && filtered.length > 1) {
        liveQueue.unshift(...filtered);
        return;
      }

      // if single event too big -> drop it
      if (bytes > MAX_EVENT_BYTES && filtered.length === 1) return;

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
    attachCursor();

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

          // buffer until first FullSnapshot
          if (!snapshotSent) {
            snapshotBuffer.push(event);

            if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER_EVENTS) {
              snapshotBuffer.splice(
                0,
                snapshotBuffer.length - MAX_SNAPSHOT_BUFFER_EVENTS,
              );
            }
          }

          // first FullSnapshot -> send snapshot via Pusher
          if (isFullSnapshot && !snapshotSent) {
            snapshotSent = true;

            const snapshotEvents = [...snapshotBuffer];
            snapshotBuffer = [];

            try {
              channelRef?.trigger("client-snapshot", { events: snapshotEvents });
            } catch {}

            return; // do not enqueue FullSnapshot in live
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
  });

  channel.bind("pusher:subscription_error", () => {
    cleanup();
  });

  pusher.connection.bind("disconnected", () => {
    cleanup();
  });
}
