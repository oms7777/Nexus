// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let channelRef: Channel | null = null;

let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];

let stopRecording: (() => void) | null = null;
let stopFlushTimer: (() => void) | null = null;

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
const MAX_SNAPSHOT_BUFFER_EVENTS = 6_000; // avoid runaway memory if snapshot never sends
const MAX_QUEUE_EVENTS = 1_500; // if queue floods, drop oldest

function safeBytes(str: string) {
  // TextEncoder is fastest/accurate for bytes
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

  liveQueue = [];
  snapshotBuffer = [];
  snapshotSent = false;
  flushing = false;

  channelRef = null;
  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // never track inside widget iframe
  if (window.self !== window.top) {
    return;
  }

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

  const flush = () => {
    if (!channelRef) return;
    if (!snapshotSent) return;
    if (flushing) return;
    if (liveQueue.length === 0) return;

    flushing = true;

    try {
      // Take a chunk (don’t send infinite)
      const chunk = liveQueue.splice(0, 120);

      // Never send FullSnapshot over Pusher
      const filtered = chunk.filter((e) => e.type !== 2);
      if (filtered.length === 0) {
        flushing = false;
        return;
      }

      const payload = { events: filtered };
      const json = JSON.stringify(payload);
      const bytes = safeBytes(json);

      // If too big, split progressively
      if (bytes > MAX_EVENT_BYTES && filtered.length > 1) {
        // Put back and split smaller
        liveQueue.unshift(...filtered);
        const half = Math.ceil(filtered.length / 2);
        const a = liveQueue.splice(0, half);
        const b = liveQueue.splice(0, half);

        // Push back remainder (keep order)
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

  // Timer flush
  const timer = window.setInterval(flush, FLUSH_EVERY_MS);
  stopFlushTimer = () => window.clearInterval(timer);

  channel.bind("pusher:subscription_succeeded", () => {
    // rrweb recording with sampling to reduce flood
    const stop: listenerHandler | undefined = record({
      // reduce very high-frequency sources
      sampling: {
        mousemove: 120, // ms
        mouseInteraction: true,
        scroll: 150, // ms
        input: "last",
      },
      emit(event: eventWithTime) {
        try {
          const isFullSnapshot = event.type === 2;

          // Buffer early events until snapshot is sent
          if (!snapshotSent) {
            snapshotBuffer.push(event);

            // prevent runaway memory if snapshot never arrives for some reason
            if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER_EVENTS) {
              snapshotBuffer.splice(0, snapshotBuffer.length - MAX_SNAPSHOT_BUFFER_EVENTS);
            }
          }

          // First FullSnapshot -> send snapshot to backend with everything we have
          if (isFullSnapshot && !snapshotSent) {
            snapshotSent = true;

            const snapshotEvents = [...snapshotBuffer];

            // After snapshot, clear buffer to avoid unlimited growth
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
              // If snapshot fails, you may want to retry, but DO NOT block UI.
              // For now: keep snapshotSent=true so live doesn't re-buffer infinitely.
            });

            return; // do not enqueue the FullSnapshot for live
          }

          // until snapshot sent, no live streaming
          if (!snapshotSent) return;

          // never send FullSnapshot via pusher
          if (isFullSnapshot) return;

          // enqueue for batching
          liveQueue.push(event);

          // cap queue size (drop oldest if flood)
          if (liveQueue.length > MAX_QUEUE_EVENTS) {
            liveQueue.splice(0, liveQueue.length - MAX_QUEUE_EVENTS);
          }
        } catch {
          // ignore
        }
      },
    });

    // ✅ TS fix: listenerHandler | undefined -> (() => void) | null
    stopRecording = stop ? (() => stop()) : null;
  });

  // If channel errors / disconnect, cleanup to avoid zombie loops
  channel.bind("pusher:subscription_error", () => {
    cleanup();
  });

  // Optional: if you ever want cursor again, do it throttled in RAF
  // (and only when snapshotSent=true to avoid doing work before it matters)
  //
  // let raf = 0;
  // let lastX = 0;
  // let lastY = 0;
  // const onMove = (e: MouseEvent) => {
  //   lastX = e.clientX / window.innerWidth;
  //   lastY = e.clientY / window.innerHeight;
  //   if (raf) return;
  //   raf = requestAnimationFrame(() => {
  //     raf = 0;
  //     if (!snapshotSent || !channelRef) return;
  //     channelRef.trigger("client-cursor", { x: lastX, y: lastY });
  //   });
  // };
  // document.addEventListener("mousemove", onMove, { passive: true });
}
