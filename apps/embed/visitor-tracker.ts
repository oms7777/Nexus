import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let pusherRef: Pusher | null = null;
let channelRef: Channel | null = null;

let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];
let stopRecording: (() => void) | null = null;

// keep last known Meta event so snapshots have href/width/height
let lastMeta: eventWithTime | null = null;

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string; // Convex Id<"contactSessions"> cast to string
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";

// DB snapshot endpoint (Next route)
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// Pusher limit ~10KB
const MAX_EVENT_BYTES = 9_000;

// ✅ batching to reduce CPU/GC + pusher triggers
const BATCH_INTERVAL_MS = 200;
const MAX_BATCH_EVENTS = 35;

// ✅ reduce rrweb heavy work
const CHECKOUT_EVERY_MS = 60_000; // was 15_000 (too aggressive)

function safeBytes(str: string) {
  return new TextEncoder().encode(str).length;
}

let onMoveRef: ((e: MouseEvent) => void) | null = null;
let rafCursor = 0;
let lastCursor: { x: number; y: number } | null = null;

// rrweb incremental batching
let batch: eventWithTime[] = [];
let batchTimer: any = null;

function flushBatch() {
  if (!channelRef || !snapshotSent) return;
  if (!batch.length) return;

  const payload = { events: batch.splice(0, batch.length) };
  const json = JSON.stringify(payload);

  // If too big, drop (best-effort)
  if (safeBytes(json) > MAX_EVENT_BYTES) {
    return;
  }

  try {
    channelRef.trigger("client-rrweb", payload);
  } catch {}
}

function scheduleFlush() {
  if (batchTimer) return;
  batchTimer = setTimeout(() => {
    batchTimer = null;
    flushBatch();
  }, BATCH_INTERVAL_MS);
}

// snapshot persist with debounce + abort
let snapshotDebounceTimer: any = null;
let snapshotAbort: AbortController | null = null;

function cleanup() {
  // stop rrweb
  try {
    stopRecording?.();
  } catch {}
  stopRecording = null;

  // ✅ remove cursor listener
  if (onMoveRef) {
    try {
      document.removeEventListener("mousemove", onMoveRef);
    } catch {}
  }
  onMoveRef = null;

  // cancel raf cursor
  try {
    if (rafCursor) cancelAnimationFrame(rafCursor);
  } catch {}
  rafCursor = 0;
  lastCursor = null;

  // flush & clear batching
  try {
    if (batchTimer) clearTimeout(batchTimer);
  } catch {}
  batchTimer = null;
  batch = [];

  // cancel snapshot debounce + inflight
  try {
    if (snapshotDebounceTimer) clearTimeout(snapshotDebounceTimer);
  } catch {}
  snapshotDebounceTimer = null;

  try {
    snapshotAbort?.abort();
  } catch {}
  snapshotAbort = null;

  // pusher cleanup
  try {
    channelRef?.unbind_all();
  } catch {}
  channelRef = null;

  try {
    pusherRef?.disconnect();
  } catch {}
  pusherRef = null;

  snapshotSent = false;
  snapshotBuffer = [];
  lastMeta = null;
  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

function persistSnapshotToDbDebounced(opts: {
  orgId: string;
  sessionId: string;
  events: eventWithTime[];
}) {
  // debounce: keep only the latest snapshot in a short window
  if (snapshotDebounceTimer) clearTimeout(snapshotDebounceTimer);

  snapshotDebounceTimer = setTimeout(async () => {
    snapshotDebounceTimer = null;

    // cancel previous inflight
    try {
      snapshotAbort?.abort();
    } catch {}
    snapshotAbort = new AbortController();

    try {
      await fetch(SNAPSHOT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: snapshotAbort.signal,
        body: JSON.stringify({
          organizationId: opts.orgId,
          sessionId: opts.sessionId,
          events: opts.events,
        }),
      });
    } catch {
      // best-effort only
    }
  }, 300);
}

export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // never track inside widget iframe
  if (window.self !== window.top) return;

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
  const channel = pusher.subscribe(channelName);
  channelRef = channel;

  channel.bind("pusher:subscription_succeeded", () => {
    const stop: listenerHandler | undefined = record({
      checkoutEveryNms: CHECKOUT_EVERY_MS,

      sampling: {
        mousemove: 120,
        mouseInteraction: true,
        scroll: 150,
        input: "last",
      },

      emit(event: eventWithTime) {
        // ✅ do nothing if tab hidden (avoid heavy work)
        if (document.hidden) return;
        if (!channelRef) return;

        // track Meta (type 4)
        if ((event as any)?.type === 4) lastMeta = event;

        const isFullSnapshot = (event as any)?.type === 2;

        // buffer at the very beginning for first snapshot
        if (!snapshotSent) snapshotBuffer.push(event);

        // 1) first FullSnapshot => persist to DB + reset dashboard
        if (isFullSnapshot && !snapshotSent) {
          snapshotSent = true;

          const snap = [...snapshotBuffer];
          snapshotBuffer = [];

          const hasMeta = snap.some((e: any) => e?.type === 4);
          const payloadEvents = !hasMeta && lastMeta ? [lastMeta, ...snap] : snap;

          persistSnapshotToDbDebounced({ orgId, sessionId, events: payloadEvents });

          try {
            channelRef.trigger("client-snapshot", { events: payloadEvents });
          } catch {}

          return; // don't send as incremental
        }

        // 2) later FullSnapshot (checkout) => persist + reset
        if (isFullSnapshot && snapshotSent) {
          const payloadEvents = lastMeta ? [lastMeta, event] : [event];

          persistSnapshotToDbDebounced({ orgId, sessionId, events: payloadEvents });

          try {
            channelRef.trigger("client-snapshot", { events: payloadEvents });
          } catch {}

          return;
        }

        // 3) incremental
        if (!snapshotSent) return;

        batch.push(event);

        // keep batch bounded
        if (batch.length >= MAX_BATCH_EVENTS) {
          flushBatch();
          return;
        }

        scheduleFlush();
      },
    });

    stopRecording = stop ? (() => stop()) : null;

    // cursor live (throttled with rAF)
    onMoveRef = (e: MouseEvent) => {
      if (!channelRef || !snapshotSent) return;
      if (document.hidden) return;

      const next = {
        x: e.clientX / Math.max(1, window.innerWidth),
        y: e.clientY / Math.max(1, window.innerHeight),
      };
      lastCursor = next;

      if (rafCursor) return;
      rafCursor = requestAnimationFrame(() => {
        rafCursor = 0;
        if (!lastCursor || !channelRef) return;
        try {
          channelRef.trigger("client-cursor", lastCursor);
        } catch {}
      });
    };

    document.addEventListener("mousemove", onMoveRef, { passive: true });
  });

  channel.bind("pusher:subscription_error", () => cleanup());
}
