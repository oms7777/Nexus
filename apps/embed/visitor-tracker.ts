// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "rrweb/typings/types";
import Pusher, { type Channel } from "pusher-js";

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string;
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// Pusher client events payload limit ~10KB
const MAX_PAYLOAD_BYTES = 9_000;

// incremental batching
const BATCH_INTERVAL_MS = 200;
const MAX_BATCH_EVENTS = 35;

// URL change protection
const URL_CHANGE_DEBOUNCE_MS = 250;
const MIN_RESTART_INTERVAL_MS = 1200;

let started = false;
let pusherRef: Pusher | null = null;
let channelRef: Channel | null = null;

// rrweb
let stopRecording: (() => void) | null = null;
let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];
let lastMeta: eventWithTime | null = null;

// cursor
let onMoveRef: ((e: MouseEvent) => void) | null = null;
let rafCursor = 0;
let lastCursor: { x: number; y: number } | null = null;

// incremental batching
let batch: eventWithTime[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

// snapshot persist debounce + abort
let snapshotDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotAbort: AbortController | null = null;

// url change detection
let lastHref: string | null = null;
let unpatchHistory: (() => void) | null = null;
let urlDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastRestartAt = 0;

// extra listeners to cleanup
let onVisibilityChange: (() => void) | null = null;
let onBeforeUnload: (() => void) | null = null;

function safeBytes(str: string) {
  return new TextEncoder().encode(str).length;
}

function flushBatchNow() {
  if (!channelRef || !snapshotSent) return;
  if (!batch.length) return;

  const payload = { events: batch.splice(0, batch.length) };
  const json = JSON.stringify(payload);

  if (safeBytes(json) > MAX_PAYLOAD_BYTES) return;

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

function persistSnapshotToDbDebounced(opts: { orgId: string; sessionId: string; events: eventWithTime[] }) {
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

function resetRecorderStateForNewPage() {
  snapshotSent = false;
  snapshotBuffer = [];
  lastMeta = null;

  batch = [];
  if (batchTimer) {
    try {
      clearTimeout(batchTimer);
    } catch {}
  }
  batchTimer = null;
}

function startRecorder(orgId: string, sessionId: string) {
  // stop previous
  try {
    stopRecording?.();
  } catch {}
  stopRecording = null;

  resetRecorderStateForNewPage();

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

      if (type === 4) lastMeta = event;

      const isFullSnapshot = type === 2;

      // buffer until first full snapshot is handled
      if (!snapshotSent) snapshotBuffer.push(event);

      if (isFullSnapshot) {
        if (!snapshotSent) {
          snapshotSent = true;

          const snap = [...snapshotBuffer];
          snapshotBuffer = [];

          const hasMeta = snap.some((e: any) => e?.type === 4);
          const payloadEvents = !hasMeta && lastMeta ? [lastMeta, ...snap] : snap;

          // persist + live snapshot
          persistSnapshotToDbDebounced({ orgId, sessionId, events: payloadEvents });

          try {
            channelRef.trigger("client-snapshot", { events: payloadEvents });
          } catch {}

          return;
        }

        // any extra full snapshot -> treat as refresh snapshot
        const payloadEvents = lastMeta ? [lastMeta, event] : [event];
        persistSnapshotToDbDebounced({ orgId, sessionId, events: payloadEvents });

        try {
          channelRef.trigger("client-snapshot", { events: payloadEvents });
        } catch {}

        return;
      }

      // incremental
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
}

function patchHistoryForUrlChanges(onChange: () => void) {
  const origPush = history.pushState;
  const origReplace = history.replaceState;

  const fire = () => Promise.resolve().then(onChange);

  history.pushState = function (this: History, ...args: any[]) {
    const ret = origPush.apply(this, args as any);
    fire();
    return ret;
  } as any;

  history.replaceState = function (this: History, ...args: any[]) {
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

function setupCursor() {
  if (onMoveRef) {
    try {
      document.removeEventListener("mousemove", onMoveRef);
    } catch {}
  }
  onMoveRef = null;

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

  if (urlDebounceTimer) {
    try {
      clearTimeout(urlDebounceTimer);
    } catch {}
  }
  urlDebounceTimer = null;

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

  if (batchTimer) {
    try {
      clearTimeout(batchTimer);
    } catch {}
  }
  batchTimer = null;
  batch = [];

  if (snapshotDebounceTimer) {
    try {
      clearTimeout(snapshotDebounceTimer);
    } catch {}
  }
  snapshotDebounceTimer = null;

  try {
    snapshotAbort?.abort();
  } catch {}
  snapshotAbort = null;

  if (onVisibilityChange) {
    try {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    } catch {}
  }
  onVisibilityChange = null;

  if (onBeforeUnload) {
    try {
      window.removeEventListener("beforeunload", onBeforeUnload);
    } catch {}
  }
  onBeforeUnload = null;

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
  lastRestartAt = 0;

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
    // start rrweb for initial page
    startRecorder(orgId, sessionId);

    // cursor always on
    setupCursor();

    // SPA URL change => restart recorder (=> FullSnapshot automatically)
    unpatchHistory = patchHistoryForUrlChanges(() => {
      const href = location.href;
      if (!href || href === lastHref) return;

      lastHref = href;

      if (urlDebounceTimer) clearTimeout(urlDebounceTimer);
      urlDebounceTimer = setTimeout(() => {
        urlDebounceTimer = null;

        const now = Date.now();
        if (now - lastRestartAt < MIN_RESTART_INTERVAL_MS) return;
        lastRestartAt = now;

        startRecorder(orgId, sessionId);
      }, URL_CHANGE_DEBOUNCE_MS);
    });

    // flush on background/unload
    onVisibilityChange = () => {
      if (document.hidden) flushBatchNow();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    onBeforeUnload = () => {
      flushBatchNow();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
  });

  channel.bind("pusher:subscription_error", () => cleanup());
}
