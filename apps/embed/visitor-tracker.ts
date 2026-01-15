// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let pusherRef: Pusher | null = null;
let channelRef: Channel | null = null;

let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];
let stopRecording: (() => void) | null = null;

let lastMeta: eventWithTime | null = null;

// cursor throttling
let onMoveRef: ((e: MouseEvent) => void) | null = null;
let rafCursor = 0;
let lastCursor: { x: number; y: number } | null = null;

// incremental batching
let batch: eventWithTime[] = [];
let batchTimer: any = null;

// snapshot persist debounce + abort
let snapshotDebounceTimer: any = null;
let snapshotAbort: AbortController | null = null;

// URL-change hook
let lastHref: string | null = null;
let unpatchHistory: (() => void) | null = null;

// protect against loops/spam
let snapshotInFlight = false;
let lastFullSnapshotAt = 0;

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string;
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// Pusher limit ~10KB
const MAX_PAYLOAD_BYTES = 9_000;

// batching
const BATCH_INTERVAL_MS = 200;
const MAX_BATCH_EVENTS = 35;

// anti-spam fullsnapshot
const MIN_FULLSNAPSHOT_INTERVAL_MS = 2500;

function safeBytes(str: string) {
  return new TextEncoder().encode(str).length;
}

function cleanup() {
  try {
    stopRecording?.();
  } catch {}
  stopRecording = null;

  if (unpatchHistory) {
    try {
      unpatchHistory();
    } catch {}
  }
  unpatchHistory = null;

  if (onMoveRef) {
    try {
      document.removeEventListener("mousemove", onMoveRef);
    } catch {}
  }
  onMoveRef = null;

  try {
    if (rafCursor) cancelAnimationFrame(rafCursor);
  } catch {}
  rafCursor = 0;
  lastCursor = null;

  try {
    if (batchTimer) clearTimeout(batchTimer);
  } catch {}
  batchTimer = null;
  batch = [];

  try {
    if (snapshotDebounceTimer) clearTimeout(snapshotDebounceTimer);
  } catch {}
  snapshotDebounceTimer = null;

  try {
    snapshotAbort?.abort();
  } catch {}
  snapshotAbort = null;

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

  lastHref = null;
  snapshotInFlight = false;
  lastFullSnapshotAt = 0;

  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

function flushBatchNow() {
  if (!channelRef || !snapshotSent) return;
  if (!batch.length) return;

  const payload = { events: batch.splice(0, batch.length) };
  const json = JSON.stringify(payload);

  if (safeBytes(json) > MAX_PAYLOAD_BYTES) {
    return; // drop best-effort
  }

  try {
    channelRef.trigger("client-rrweb", payload);
  } catch {}
}

function scheduleFlush() {
  if (batchTimer) return;
  batchTimer = setTimeout(() => {
    batchTimer = null;
    flushBatchNow();
  }, BATCH_INTERVAL_MS);
}

function persistSnapshotToDbDebounced(opts: {
  orgId: string;
  sessionId: string;
  events: eventWithTime[];
}) {
  if (snapshotDebounceTimer) clearTimeout(snapshotDebounceTimer);

  snapshotDebounceTimer = setTimeout(async () => {
    snapshotDebounceTimer = null;

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
      // best effort
    }
  }, 250);
}

function triggerFullSnapshot(reason: string) {
  if (!snapshotSent) return;
  if (snapshotInFlight) return;

  const take = (record as any)?.takeFullSnapshot;
  if (typeof take !== "function") {
    console.warn("[tracker] takeFullSnapshot unavailable; cannot snapshot on URL change", reason);
    return;
  }

  const now = Date.now();
  if (now - lastFullSnapshotAt < MIN_FULLSNAPSHOT_INTERVAL_MS) return;

  snapshotInFlight = true;
  lastFullSnapshotAt = now;

  try {
    // Will cause rrweb to emit a type=2 FullSnapshot soon
    take();
  } catch {
    snapshotInFlight = false;
  }
}

function patchHistoryForUrlChanges(onChange: () => void) {
  const w = window as any;

  const origPush = history.pushState;
  const origReplace = history.replaceState;

  const fire = () => {
    // microtask: let router update first
    Promise.resolve().then(onChange);
  };

  history.pushState = function (...args: any[]) {
    const ret = origPush.apply(this, args as any);
    fire();
    return ret;
  } as any;

  history.replaceState = function (...args: any[]) {
    const ret = origReplace.apply(this, args as any);
    fire();
    return ret;
  } as any;

  window.addEventListener("popstate", fire);
  window.addEventListener("hashchange", fire);

  return () => {
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener("popstate", fire);
    window.removeEventListener("hashchange", fire);
  };
}

export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // never track inside widget iframe
  if (window.self !== window.top) return;

  started = true;
  lastHref = location.href;

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
    // ✅ URL change detector (SPA safe)
    unpatchHistory = patchHistoryForUrlChanges(() => {
      const href = location.href;
      if (!href) return;
      if (href === lastHref) return;

      lastHref = href;
      // trigger full snapshot ONLY on URL change
      triggerFullSnapshot("url-change");
    });

    const stop: listenerHandler | undefined = record({
      sampling: {
        mousemove: 120,
        mouseInteraction: true,
        scroll: 150,
        input: "last",
      },

      emit(event: eventWithTime) {
        if (document.hidden) return;
        if (!channelRef) return;

        const type = (event as any)?.type;

        if (type === 4) {
          lastMeta = event;
        }

        const isFullSnapshot = type === 2;

        // buffer until first full snapshot is persisted/sent
        if (!snapshotSent) snapshotBuffer.push(event);

        if (isFullSnapshot) {
          // first full snapshot
          if (!snapshotSent) {
            snapshotSent = true;

            const snap = [...snapshotBuffer];
            snapshotBuffer = [];

            const hasMeta = snap.some((e: any) => e?.type === 4);
            const payloadEvents =
              !hasMeta && lastMeta ? [lastMeta, ...snap] : snap;

            persistSnapshotToDbDebounced({ orgId, sessionId, events: payloadEvents });

            try {
              channelRef.trigger("client-snapshot", { events: payloadEvents });
            } catch {}

            snapshotInFlight = false;
            return;
          }

          // later full snapshot (from URL change)
          const payloadEvents = lastMeta ? [lastMeta, event] : [event];

          persistSnapshotToDbDebounced({ orgId, sessionId, events: payloadEvents });

          try {
            channelRef.trigger("client-snapshot", { events: payloadEvents });
          } catch {}

          snapshotInFlight = false;
          return;
        }

        // incremental events
        if (!snapshotSent) return;

        batch.push(event);

        if (batch.length >= MAX_BATCH_EVENTS) {
          flushBatchNow();
          return;
        }

        scheduleFlush();
      },
    });

    stopRecording = stop ? (() => stop()) : null;

    // ✅ cursor live (NOT gated by snapshotSent, sinon ça “disparaît” quand snapshot delay)
    onMoveRef = (e: MouseEvent) => {
      if (!channelRef) return;
      if (document.hidden) return;

      lastCursor = {
        x: e.clientX / Math.max(1, window.innerWidth),
        y: e.clientY / Math.max(1, window.innerHeight),
      };

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
