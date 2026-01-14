// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "@rrweb/types";
import Pusher from "pusher-js";
import type { Channel } from "pusher-js";

let started = false;

let pusherRef: Pusher | null = null;
let channelRef: Channel | null = null;
let stopRecording: listenerHandler | undefined;

let flushTimer: number | null = null;

// Snapshot bootstrap (sent once, via HTTP)
let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];

// Live incremental events (sent via Pusher)
let liveQueue: eventWithTime[] = [];
let flushing = false;

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// ---- PERF / LIMITS ----
// client-events Pusher limit ~10KB => keep very small
const MAX_PUSHER_BYTES = 8_500;
const FLUSH_EVERY_MS = 350;
const MAX_QUEUE_EVENTS = 400;

// snapshot upload limit (avoid 413 + avoid rrweb replayer freeze)
const MAX_SNAPSHOT_EVENTS = 2200;

function isHidden() {
  try {
    return document.visibilityState === "hidden";
  } catch {
    return false;
  }
}

function safeBytes(str: string) {
  return new TextEncoder().encode(str).length;
}

function normalizeCursor(e: MouseEvent) {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  return {
    x: Math.min(1, Math.max(0, e.clientX / w)),
    y: Math.min(1, Math.max(0, e.clientY / h)),
  };
}

// ✅ Keep last Meta (type 4) + last FullSnapshot (type 2) + tail
function trimSnapshotForUpload(events: eventWithTime[]) {
  if (!Array.isArray(events) || events.length <= MAX_SNAPSHOT_EVENTS) return events;

  let lastFull = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if ((events[i] as any)?.type === 2) {
      lastFull = i;
      break;
    }
  }

  let from = Math.max(0, events.length - MAX_SNAPSHOT_EVENTS);

  if (lastFull >= 0) {
    // include a nearby Meta (type 4) before full snapshot
    let lastMeta = -1;
    for (let i = lastFull - 1; i >= 0 && lastFull - i < 80; i--) {
      if ((events[i] as any)?.type === 4) {
        lastMeta = i;
        break;
      }
    }
    from = lastMeta >= 0 ? lastMeta : lastFull;
  }

  const sliced = events.slice(from);
  return sliced.length > MAX_SNAPSHOT_EVENTS ? sliced.slice(-MAX_SNAPSHOT_EVENTS) : sliced;
}

function cleanup() {
  try {
    stopRecording?.();
  } catch {}
  stopRecording = undefined;

  if (flushTimer) {
    try {
      window.clearInterval(flushTimer);
    } catch {}
    flushTimer = null;
  }

  try {
    channelRef?.unbind_all();
  } catch {}
  channelRef = null;

  try {
    pusherRef?.disconnect();
  } catch {}
  pusherRef = null;

  // reset state
  snapshotSent = false;
  snapshotBuffer = [];
  liveQueue = [];
  flushing = false;

  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

export function initVisitorTracking({
  orgId,
  sessionId,
}: {
  orgId: string;
  sessionId: string;
}) {
  if (started) return;
  if (typeof window === "undefined") return;
  if (window.self !== window.top) return;
  if (!orgId || !sessionId) return;

  started = true;

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
  const channel = pusher.subscribe(channelName) as Channel;
  channelRef = channel;

  // CURSOR (cheap, ok on Pusher)
  const onMouseMove = (e: MouseEvent) => {
    if (!channelRef) return;
    if (isHidden()) return;
    try {
      channelRef.trigger("client-cursor", normalizeCursor(e));
    } catch {}
  };
  window.addEventListener("mousemove", onMouseMove, { passive: true });

  // LIVE FLUSH (incremental only, small payload)
  const flush = () => {
    if (!channelRef) return;
    if (!snapshotSent) return; // don't stream before bootstrap exists
    if (flushing) return;
    if (!liveQueue.length) return;
    if (isHidden()) return;

    flushing = true;
    try {
      const chunk = liveQueue.splice(0, 80);

      // never send FullSnapshot
      const filtered = chunk.filter((e) => (e as any)?.type !== 2);
      if (!filtered.length) return;

      const payload = { events: filtered };
      const json = JSON.stringify(payload);
      if (safeBytes(json) > MAX_PUSHER_BYTES) {
        // if too big, put back and try smaller next tick
        liveQueue.unshift(...filtered);
        return;
      }

      channelRef.trigger("client-rrweb", payload);
    } catch {
      // ignore
    } finally {
      flushing = false;
    }
  };

  flushTimer = window.setInterval(flush, FLUSH_EVERY_MS);

  channel.bind("pusher:subscription_succeeded", () => {
    stopRecording = record({
      sampling: {
        mousemove: 180,
        scroll: 220,
        input: "last",
        mouseInteraction: true,
      },
      emit(event: eventWithTime) {
        try {
          if (isHidden()) return;

          const isFullSnapshot = (event as any)?.type === 2;

          // 1) buffer until first FullSnapshot
          if (!snapshotSent) {
            snapshotBuffer.push(event);

            // small safety cap while waiting
            if (snapshotBuffer.length > MAX_SNAPSHOT_EVENTS + 200) {
              snapshotBuffer.splice(0, snapshotBuffer.length - (MAX_SNAPSHOT_EVENTS + 200));
            }

            if (isFullSnapshot) {
              snapshotSent = true;

              const eventsToSend = trimSnapshotForUpload(snapshotBuffer);
              snapshotBuffer = [];

              // ✅ BOOTSTRAP PAGE via HTTP -> Convex -> UI reads with useQuery
              fetch(SNAPSHOT_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  organizationId: orgId,
                  sessionId,
                  events: eventsToSend,
                }),
                mode: "cors",
                keepalive: true,
              }).catch(() => {});

              return; // don't stream FullSnapshot
            }

            return; // no live until snapshot sent
          }

          // 2) after snapshot: only incremental events go to liveQueue
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
    window.removeEventListener("mousemove", onMouseMove);
    cleanup();
  });

  pusher.connection.bind("disconnected", () => {
    window.removeEventListener("mousemove", onMouseMove);
    cleanup();
  });
}
