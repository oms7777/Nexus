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

// Pusher limit ~10KB
const MAX_PAYLOAD_BYTES = 9_000;

// batching incremental
const BATCH_INTERVAL_MS = 200;
const MAX_BATCH_EVENTS = 35;

// anti-spam / anti loop
const URL_CHANGE_DEBOUNCE_MS = 250;      // évite double triggers SPA
const MIN_RESTART_INTERVAL_MS = 1200;    // évite restart en boucle

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

// batching
let batch: eventWithTime[] = [];
let batchTimer: any = null;

// snapshot persist debounce + abort
let snapshotDebounceTimer: any = null;
let snapshotAbort: AbortController | null = null;

// url change detection
let lastHref: string | null = null;
let unpatchHistory: (() => void) | null = null;
let urlDebounceTimer: any = null;
let lastRestartAt = 0;

function safeBytes(str: string) {
  return new TextEncoder().encode(str).length;
}

function flushBatchNow() {
  if (!channelRef || !snapshotSent) return;
  if (!batch.length) return;

  const payload = { events: batch.splice(0, batch.length) };
  const json = JSON.stringify(payload);

  // best-effort: drop if too big
  if (safeBytes(json) > MAX_PAYLOAD_BYTES) return;

  try {
    channelRef.trigger("client-rrweb", payload);
  } catch {
    // ignore best-effort
  }
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
      // best-effort only
    }
  }, 250);
}

/**
 * IMPORTANT : au lieu de takeFullSnapshot (pas toujours dispo),
 * on redémarre rrweb sur URL change => rrweb génère un FullSnapshot (type=2).
 */
function resetRecorderStateForNewPage() {
  snapshotSent = false;
  snapshotBuffer = [];
  lastMeta = null;

  // clear incremental batch
  batch = [];
  try {
    if (batchTimer) clearTimeout(batchTimer);
  } catch {}
  batchTimer = null;
}

function startRecorder(orgId: string, sessionId: string) {
  // stop previous if any
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

      // keep Meta
      if (type === 4) lastMeta = event;

      const isFullSnapshot = type === 2;

      // buffer until first full snapshot is handled
      if (!snapshotSent) snapshotBuffer.push(event);

      if (isFullSnapshot) {
        // first full snapshot for this page
        if (!snapshotSent) {
          snapshotSent = true;

          const snap = [...snapshotBuffer];
          snapshotBuffer = [];

          const hasMeta = snap.some((e: any) => e?.type === 4);
          const payloadEvents = !hasMeta && lastMeta ? [lastMeta, ...snap] : snap;

          // persist + send to live
          persistSnapshotToDbDebounced({ orgId, sessionId, events: payloadEvents });

          try {
            channelRef.trigger("client-snapshot", { events: payloadEvents });
          } catch {}

          return; // don't send as incremental
        }

        // in theory, more full snapshots can happen: ignore or treat as "reset"
        // (we keep it simple: treat as a reset snapshot)
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

  const fire = () => {
    // microtask: laisse le router finir
    Promise.resolve().then(onChange);
  };

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
  // remove old
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
      } catch {
        // ignore
      }
    });
  };

  document.addEventListener("mousemove", onMoveRef, { passive: true });
}

function cleanup() {
  // stop rrweb
  try {
    stopRecording?.();
  } catch {}
  stopRecording = null;

  // url patch
  if (unpatchHistory) {
    try {
      unpatchHistory();
    } catch {}
  }
  unpatchHistory = null;

  try {
    if (urlDebounceTimer) clearTimeout(urlDebounceTimer);
  } catch {}
  urlDebounceTimer = null;

  // cursor
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

  // batching
  try {
    if (batchTimer) clearTimeout(batchTimer);
  } catch {}
  batchTimer = null;
  batch = [];

  // snapshot persist
  try {
    if (snapshotDebounceTimer) clearTimeout(snapshotDebounceTimer);
  } catch {}
  snapshotDebounceTimer = null;

  try {
    snapshotAbort?.abort();
  } catch {}
  snapshotAbort = null;

  // pusher
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
    // start rrweb for the first page
    startRecorder(orgId, sessionId);

    // cursor always on
    setupCursor();

    // SPA URL change -> restart recorder (=> new FullSnapshot)
    unpatchHistory = patchHistoryForUrlChanges(() => {
      const href = location.href;
      if (!href) return;
      if (href === lastHref) return;

      lastHref = href;

      // debounce url changes
      if (urlDebounceTimer) clearTimeout(urlDebounceTimer);
      urlDebounceTimer = setTimeout(() => {
        urlDebounceTimer = null;

        const now = Date.now();
        if (now - lastRestartAt < MIN_RESTART_INTERVAL_MS) return;
        lastRestartAt = now;

        // IMPORTANT: restart rrweb => full snapshot for new page
        startRecorder(orgId, sessionId);
      }, URL_CHANGE_DEBOUNCE_MS);
    });

    // flush on background/unload
    const onVis = () => {
      if (document.hidden) flushBatchNow();
    };
    document.addEventListener("visibilitychange", onVis);

    const onBeforeUnload = () => {
      flushBatchNow();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    // cleanup listeners on disconnect
    channel.bind("pusher:subscription_error", () => cleanup());
  });

  channel.bind("pusher:subscription_error", () => cleanup());
}
