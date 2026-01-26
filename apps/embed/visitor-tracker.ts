// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "rrweb/typings/types";
import Pusher, { type Channel } from "pusher-js";

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string;
};

// =======================
// Config
// =======================
const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// Pusher client events payload limit ~10KB
const MAX_PAYLOAD_BYTES = 9_000;

// batching
const BATCH_INTERVAL_MS = 100;
const MAX_BATCH_EVENTS = 10;

// snapshot persist debounce
const SNAPSHOT_DEBOUNCE_MS = 300;

// URL-change -> restart recorder (reliable full snapshot)
const URL_CHANGE_DEBOUNCE_MS = 250;
const MIN_RESTART_INTERVAL_MS = 3000;

// activity / idle control
const IDLE_PAUSE_MS = 60_000;

// safety limits
const MAX_SESSION_MS = 12 * 60 * 1000; // 12 minutes max rrweb running
const MAX_TOTAL_EVENTS = 25_000;

// perf watchdog (stop rrweb if host is too slow)
const WATCHDOG_INTERVAL_MS = 30_000;
const MAX_LONGTASKS_PER_WINDOW = 8;

// =======================
// State
// =======================
let started = false;

let pusherRef: Pusher | null = null;
let channelRef: Channel | null = null;

// rrweb
let stopRecording: (() => void) | null = null;
let recordStopFn: listenerHandler | undefined;

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

// URL-change hook
let lastHref: string | null = null;
let unpatchHistory: (() => void) | null = null;
let urlDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastRestartAt = 0;

// perf watchdog
let longTaskObserver: PerformanceObserver | null = null;
let longTaskCount = 0;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

// session stop timer
let sessionStopTimer: ReturnType<typeof setInterval> | null = null;

// activity
let lastActivityAt = Date.now();
let totalEvents = 0;

// unload handlers (we REMOVE them on destroy)
let onBeforeUnload: (() => void) | null = null;
let onPageHide: (() => void) | null = null;

function safeBytes(str: string) {
  return new TextEncoder().encode(str).length;
}

function now() {
  return Date.now();
}

function markActivity() {
  lastActivityAt = now();
}

function shouldPauseHeavy() {
  return now() - lastActivityAt > IDLE_PAUSE_MS;
}

function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function getPageContext() {
  try {
    return {
      href: typeof location !== "undefined" ? location.href : undefined,
      title: typeof document !== "undefined" ? document.title : undefined,
    };
  } catch {
    return { href: undefined, title: undefined };
  }
}

// =======================
// Networking
// =======================
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

    const ctx = getPageContext();

    try {
      await fetch(SNAPSHOT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: snapshotAbort.signal,
        body: JSON.stringify({
          organizationId: opts.orgId,
          sessionId: opts.sessionId,
          // ✅ keep original field name
          events: opts.events,
          // ✅ extra context (safe to ignore server-side if not used)
          pageUrl: ctx.href,
          title: ctx.title,
        }),
      });
    } catch {
      // best effort
    }
  }, SNAPSHOT_DEBOUNCE_MS);
}

// =======================
// Recorder lifecycle
// =======================
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

function stopRrwebOnly() {
  try {
    stopRecording?.();
  } catch {}
  stopRecording = null;
  recordStopFn = undefined;

  resetRecorderStateForNewPage();
}

function emitPageEvent() {
  if (!channelRef) return;
  const ctx = getPageContext();
  if (!ctx.href) return;

  try {
    channelRef.trigger("client-page", {
      href: ctx.href,
      title: ctx.title,
      ts: now(),
    });
  } catch {}
}

function startRrwebRecorder(orgId: string, sessionId: string) {
  stopRrwebOnly();

  totalEvents = 0;
  lastActivityAt = now();

  const stop: listenerHandler | undefined = record({
    sampling: {
      mousemove: false as any,
      mouseInteraction: true,
      scroll: 200,
      input: "last",
    },

    slimDOMOptions: {
      script: true,
      comment: true,
      headFavicon: true,
      headMetaDescKeywords: true,
      headMetaSocial: true,
      headMetaRobots: true,
    } as any,

    emit(event: eventWithTime) {
      if (document.hidden) return;
      if (!stopRecording) return;

      totalEvents++;
      if (totalEvents > MAX_TOTAL_EVENTS) {
        stopRrwebOnly();
        return;
      }

      // =======================
      // Idle gating (keep scroll/resize real-time)
      // =======================
      const type = (event as any)?.type;
      const src = (event as any)?.data?.source;

      const isIncremental = type === 3; // IncrementalSnapshot
      const isScroll =
        src === 3 ||
        src === "scroll" ||
        src === "Scroll" ||
        src === "IncrementalSource.Scroll";
      const isViewportResize =
        src === 4 || src === "viewport-resize" || src === "ViewportResize";

      // ✅ mark activity EARLY so scroll/resize exits idle
      markActivity();

      // ✅ if idle: only allow meta/full snapshot + scroll/resize incrementals
      if (shouldPauseHeavy()) {
        const allow =
          type === 4 || type === 2 || (isIncremental && (isScroll || isViewportResize));
        if (!allow) return;
      }

      // rrweb meta
      if (type === 4) lastMeta = event;

      const isFullSnapshot = type === 2;

      if (!snapshotSent) snapshotBuffer.push(event);

      if (isFullSnapshot) {
        if (!snapshotSent) {
          snapshotSent = true;

          const snap = [...snapshotBuffer];
          snapshotBuffer = [];

          const hasMeta = snap.some((e: any) => e?.type === 4);
          const payloadEvents = !hasMeta && lastMeta ? [lastMeta, ...snap] : snap;

          persistSnapshotToDbDebounced({ orgId, sessionId, events: payloadEvents });

          try {
            const ctx = getPageContext();
            channelRef?.trigger("client-snapshot", {
              events: payloadEvents,
              pageUrl: ctx.href,
              title: ctx.title,
            });
          } catch {}

          return;
        }

        const payloadEvents = lastMeta ? [lastMeta, event] : [event];
        persistSnapshotToDbDebounced({ orgId, sessionId, events: payloadEvents });

        try {
          const ctx = getPageContext();
          channelRef?.trigger("client-snapshot", {
            events: payloadEvents,
            pageUrl: ctx.href,
            title: ctx.title,
          });
        } catch {}

        return;
      }

      // =======================
      // Incremental
      // =======================
      if (!snapshotSent) return;
      if (!channelRef) return;

      batch.push(event);

      // ✅ flush immediat sur scroll / resize (pour que le live suive la position)
      // (on réutilise isIncremental/isScroll/isViewportResize calculés plus haut)
      if (isIncremental && (isScroll || isViewportResize)) {
        flushBatchNow();
        return;
      }

      if (batch.length >= MAX_BATCH_EVENTS) {
        flushBatchNow();
        return;
      }

      scheduleFlush();
    },
  });

  recordStopFn = stop;
  stopRecording = stop ? (() => stop()) : null;

  setTimeout(() => {
    if (!stopRecording) return;
    try {
      (record as any).takeFullSnapshot?.();
    } catch {}
  }, 600);
}

function restartRrwebRecorderDebounced(orgId: string, sessionId: string) {
  if (!channelRef) return;

  if (urlDebounceTimer) clearTimeout(urlDebounceTimer);
  urlDebounceTimer = setTimeout(() => {
    urlDebounceTimer = null;

    const t = now();
    if (t - lastRestartAt < MIN_RESTART_INTERVAL_MS) return;
    lastRestartAt = t;

    startRrwebRecorder(orgId, sessionId);
  }, URL_CHANGE_DEBOUNCE_MS);
}

// =======================
// History patch
// =======================
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

// =======================
// Cursor
// =======================
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

    markActivity();

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

// =======================
// Perf watchdog
// =======================
function startPerfWatchdog() {
  longTaskCount = 0;

  if (typeof PerformanceObserver !== "undefined") {
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries?.length) longTaskCount += entries.length;
      });
      // @ts-ignore
      longTaskObserver.observe({ entryTypes: ["longtask"] });
    } catch {
      longTaskObserver = null;
    }
  }

  watchdogTimer = setInterval(() => {
    if (document.hidden) return;

    if (longTaskCount >= MAX_LONGTASKS_PER_WINDOW) {
      stopRrwebOnly();
    }

    longTaskCount = 0;
  }, WATCHDOG_INTERVAL_MS);
}

// =======================
// Unload handling
// =======================
function attachUnloadHandlers() {
  detachUnloadHandlers();

  onBeforeUnload = () => {
    try {
      flushBatchNow();
    } catch {}
    try {
      stopRrwebOnly();
    } catch {}
    try {
      snapshotAbort?.abort();
    } catch {}
  };

  onPageHide = () => {
    try {
      flushBatchNow();
    } catch {}
    try {
      stopRrwebOnly();
    } catch {}
    try {
      snapshotAbort?.abort();
    } catch {}
  };

  window.addEventListener("beforeunload", onBeforeUnload);
  window.addEventListener("pagehide", onPageHide);
}

function detachUnloadHandlers() {
  if (onBeforeUnload) {
    try {
      window.removeEventListener("beforeunload", onBeforeUnload);
    } catch {}
  }
  if (onPageHide) {
    try {
      window.removeEventListener("pagehide", onPageHide);
    } catch {}
  }
  onBeforeUnload = null;
  onPageHide = null;
}

// =======================
// Cleanup
// =======================
function cleanup() {
  stopRrwebOnly();

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

  try {
    longTaskObserver?.disconnect();
  } catch {}
  longTaskObserver = null;
  longTaskCount = 0;

  if (watchdogTimer) {
    try {
      clearInterval(watchdogTimer);
    } catch {}
  }
  watchdogTimer = null;

  if (sessionStopTimer) {
    try {
      clearInterval(sessionStopTimer);
    } catch {}
  }
  sessionStopTimer = null;

  detachUnloadHandlers();

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

  totalEvents = 0;
  lastActivityAt = now();

  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

// =======================
// Init
// =======================
export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  // ✅ CRITICAL: ne démarre pas tant que orgId/sessionId ne sont pas OK
  if (!isNonEmptyString(orgId) || !isNonEmptyString(sessionId)) return;
  if (started) return;
  if (typeof window === "undefined") return;

  // never track inside widget iframe (si tu veux tracker dans iframe, enlève ça)
  if (window.self !== window.top) return;

  started = true;
  lastHref = location.href;
  lastActivityAt = now();
  totalEvents = 0;

  const pusher = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    forceTLS: true,
    disableStats: true,
    enabledTransports: ["ws", "wss"],
    disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],
    channelAuthorization: {
      endpoint: PUSHER_AUTH_URL,
      transport: "ajax",
      // ✅ garde ces params (même si ton auth peut parser le channelName, ça aide pour debug/future)
      params: { orgId, sessionId },
    },
  });

  pusherRef = pusher;

  const channelName = `presence-org_${orgId}_session_${sessionId}`;
  const channel = pusher.subscribe(channelName);
  channelRef = channel;

  channel.bind("pusher:subscription_succeeded", () => {
    startPerfWatchdog();

    // ✅ emit page context ASAP (utile pour current page / current url côté UI)
    emitPageEvent();

    const startedAt = now();
    sessionStopTimer = setInterval(() => {
      if (!started) return;
      if (now() - startedAt > MAX_SESSION_MS) {
        stopRrwebOnly();
        if (sessionStopTimer) {
          clearInterval(sessionStopTimer);
          sessionStopTimer = null;
        }
      }
    }, 10_000);

    setupCursor();
    startRrwebRecorder(orgId, sessionId);

    unpatchHistory = patchHistoryForUrlChanges(() => {
      const href = location.href;
      if (!href || href === lastHref) return;

      lastHref = href;
      markActivity();

      // ✅ push current page immediately (en plus du restart snapshot)
      emitPageEvent();

      if (!channelRef) return;
      if (stopRecording) restartRrwebRecorderDebounced(orgId, sessionId);
    });

    attachUnloadHandlers();
  });

  channel.bind("pusher:subscription_error", () => {
    cleanup();
  });
}