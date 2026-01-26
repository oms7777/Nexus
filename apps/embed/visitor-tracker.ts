// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "rrweb/typings/types";
import Pusher, { type Channel } from "pusher-js";

type VisitorTrackingOptions = {
  orgId: string;
  contactSessionId: string; // MUST be the Convex contactSessionId (string)
};

// =======================
// Config (from Vite env)
// =======================
const PUSHER_KEY = (import.meta as any).env?.VITE_PUSHER_KEY as string | undefined;
const PUSHER_CLUSTER = (import.meta as any).env?.VITE_PUSHER_CLUSTER as string | undefined;
const PUSHER_AUTH_URL = (import.meta as any).env?.VITE_PUSHER_AUTH_URL as string | undefined;

const VISIT_URL = "https://app.inboundless.co/api/tracker/visit";

// Pusher client events payload should be < 10KB. Keep margin.
const MAX_PAYLOAD_BYTES = 9_000;

const BATCH_INTERVAL_MS = 250;
const MAX_BATCH_EVENTS = 25;

const URL_CHANGE_DEBOUNCE_MS = 250;
const MIN_RESTART_INTERVAL_MS = 3000;

const IDLE_PAUSE_MS = 60_000;

const MAX_SESSION_MS = 12 * 60 * 1000;
const MAX_TOTAL_EVENTS = 25_000;

const WATCHDOG_INTERVAL_MS = 30_000;
const MAX_LONGTASKS_PER_WINDOW = 8;

const PAGES_MAX = 20;
const VISIT_DEBOUNCE_MS = 500;
const MIN_VISIT_INTERVAL_MS = 800;

const PRESENCE_HEARTBEAT_MS = 15_000;

// =======================
// State
// =======================
let started = false;
let pusherRef: Pusher | null = null;
let channelRef: Channel | null = null;

let stopRecording: (() => void) | null = null;
let recordStopFn: listenerHandler | undefined;

// rrweb gating: do not send incremental events until we sent a full snapshot
let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];
let lastMeta: eventWithTime | null = null;

let rrwebWatching = false;

let onMoveRef: ((e: MouseEvent) => void) | null = null;
let rafCursor = 0;
let lastCursor: { x: number; y: number } | null = null;

let batch: eventWithTime[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

let lastHref: string | null = null;
let unpatchHistory: (() => void) | null = null;
let urlDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastRestartAt = 0;

let longTaskObserver: PerformanceObserver | null = null;
let longTaskCount = 0;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

let sessionStopTimer: ReturnType<typeof setInterval> | null = null;

let lastActivityAt = Date.now();
let totalEvents = 0;

let onBeforeUnload: (() => void) | null = null;
let onPageHide: (() => void) | null = null;

let pages: string[] = [];
let visitDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastVisitPersistAt = 0;
let visitAbort: AbortController | null = null;

let presenceTimer: ReturnType<typeof setInterval> | null = null;

function assertConfig() {
  if (!PUSHER_KEY || !PUSHER_CLUSTER || !PUSHER_AUTH_URL) {
    // eslint-disable-next-line no-console
    console.warn(
      "[visitor-tracker] Missing VITE_PUSHER_* env. " +
        "Set VITE_PUSHER_KEY / VITE_PUSHER_CLUSTER / VITE_PUSHER_AUTH_URL in apps/embed."
    );
    return false;
  }
  return true;
}

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

function normalizeUrl(u: string) {
  try {
    const url = new URL(u);
    url.hash = "";
    return url.toString();
  } catch {
    return u;
  }
}

function pushPage(url: string) {
  const clean = normalizeUrl(url);
  if (!clean) return;

  const idx = pages.indexOf(clean);
  if (idx >= 0) pages.splice(idx, 1);

  pages.push(clean);

  if (pages.length > PAGES_MAX) {
    pages.splice(0, pages.length - PAGES_MAX);
  }
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

function persistVisitToDbDebounced(opts: {
  orgId: string;
  sessionId: string;
  pageUrl: string;
  title?: string;
  pages: string[];
  lastSeenAt: number;
}) {
  if (visitDebounceTimer) clearTimeout(visitDebounceTimer);

  visitDebounceTimer = setTimeout(async () => {
    visitDebounceTimer = null;

    const t = now();
    if (t - lastVisitPersistAt < MIN_VISIT_INTERVAL_MS) return;
    lastVisitPersistAt = t;

    try {
      visitAbort?.abort();
    } catch {}
    visitAbort = new AbortController();

    try {
      await fetch(VISIT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: visitAbort.signal,
        body: JSON.stringify({
          organizationId: opts.orgId,
          sessionId: opts.sessionId,
          pageUrl: opts.pageUrl,
          title: opts.title,
          pages: opts.pages,
          lastSeenAt: opts.lastSeenAt,
        }),
      });
    } catch {}
  }, VISIT_DEBOUNCE_MS);
}

function persistPresenceNow(orgId: string, sessionId: string) {
  try {
    const href = location.href;
    const title = document.title;
    const ts = now();

    pushPage(href);

    persistVisitToDbDebounced({
      orgId,
      sessionId,
      pageUrl: href,
      title,
      pages: [...pages],
      lastSeenAt: ts,
    });
  } catch {}
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

function stopRrwebOnly() {
  try {
    stopRecording?.();
  } catch {}
  stopRecording = null;
  recordStopFn = undefined;

  resetRecorderStateForNewPage();
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

      if (shouldPauseHeavy()) {
        const t = (event as any)?.type;
        // keep meta + full snapshot, skip noisy stuff when idle
        if (t !== 4 && t !== 2) return;
      }

      markActivity();

      const type = (event as any)?.type;
      if (type === 4) lastMeta = event;

      const isFullSnapshot = type === 2;

      if (!snapshotSent) snapshotBuffer.push(event);

      if (isFullSnapshot) {
        // 1) first full snapshot => send buffered + ensure meta
        if (!snapshotSent) {
          snapshotSent = true;

          const snap = [...snapshotBuffer];
          snapshotBuffer = [];

          const hasMeta = snap.some((e: any) => e?.type === 4);
          const payloadEvents = !hasMeta && lastMeta ? [lastMeta, ...snap] : snap;

          try {
            channelRef?.trigger("client-snapshot", { events: payloadEvents });
          } catch {}

          // Option B: persist only via /visit
          persistPresenceNow(orgId, sessionId);
          return;
        }

        // 2) subsequent full snapshots: send [meta + snapshot] or snapshot
        const payloadEvents = lastMeta ? [lastMeta, event] : [event];

        try {
          channelRef?.trigger("client-snapshot", { events: payloadEvents });
        } catch {}

        // Option B: persist only via /visit
        persistPresenceNow(orgId, sessionId);
        return;
      }

      // No incremental events until we have a full snapshot
      if (!snapshotSent) return;
      if (!channelRef) return;

      batch.push(event);

      if (batch.length >= MAX_BATCH_EVENTS) {
        flushBatchNow();
        return;
      }

      scheduleFlush();
    },
  });

  recordStopFn = stop;
  stopRecording = stop ? (() => stop()) : null;

  // force first snapshot soon
  const doSnapshot = () => {
    if (!stopRecording) return;
    try {
      (record as any).takeFullSnapshot?.();
    } catch {}
  };

  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(doSnapshot, { timeout: 2000 });
  } else {
    setTimeout(doSnapshot, 1500);
  }
}

function restartRrwebRecorderDebounced(orgId: string, sessionId: string) {
  if (!channelRef) return;
  if (!rrwebWatching) return;
  if (!stopRecording) return;

  if (urlDebounceTimer) clearTimeout(urlDebounceTimer);
  urlDebounceTimer = setTimeout(() => {
    urlDebounceTimer = null;

    const t = now();
    if (t - lastRestartAt < MIN_RESTART_INTERVAL_MS) return;
    lastRestartAt = t;

    startRrwebRecorder(orgId, sessionId);
  }, URL_CHANGE_DEBOUNCE_MS);
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

function startPerfWatchdog() {
  longTaskCount = 0;

  if (typeof PerformanceObserver !== "undefined") {
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries?.length) longTaskCount += entries.length;
      });
      longTaskObserver.observe({ entryTypes: ["longtask"] } as any);
    } catch {
      longTaskObserver = null;
    }
  }

  watchdogTimer = setInterval(() => {
    if (document.hidden) return;

    if (longTaskCount >= MAX_LONGTASKS_PER_WINDOW) {
      stopRrwebOnly();
      rrwebWatching = false;
    }

    longTaskCount = 0;
  }, WATCHDOG_INTERVAL_MS);
}

function startPresenceHeartbeat(orgId: string, sessionId: string) {
  persistPresenceNow(orgId, sessionId);

  const onVis = () => {
    if (!document.hidden) persistPresenceNow(orgId, sessionId);
  };
  document.addEventListener("visibilitychange", onVis);

  if (presenceTimer) {
    try {
      clearInterval(presenceTimer);
    } catch {}
  }
  presenceTimer = setInterval(() => {
    if (!started) return;
    if (document.hidden) return;
    persistPresenceNow(orgId, sessionId);
  }, PRESENCE_HEARTBEAT_MS);

  return () => {
    try {
      document.removeEventListener("visibilitychange", onVis);
    } catch {}
    if (presenceTimer) {
      try {
        clearInterval(presenceTimer);
      } catch {}
    }
    presenceTimer = null;
  };
}

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
      visitAbort?.abort();
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
      visitAbort?.abort();
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

  if (visitDebounceTimer) {
    try {
      clearTimeout(visitDebounceTimer);
    } catch {}
  }
  visitDebounceTimer = null;

  try {
    visitAbort?.abort();
  } catch {}
  visitAbort = null;

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

  if (presenceTimer) {
    try {
      clearInterval(presenceTimer);
    } catch {}
  }
  presenceTimer = null;

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

  rrwebWatching = false;

  pages = [];
  lastVisitPersistAt = 0;

  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

export function initVisitorTracking({ orgId, contactSessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  if (!assertConfig()) return;

  started = true;
  lastHref = location.href;
  lastActivityAt = now();
  totalEvents = 0;
  rrwebWatching = false;

  pages = [];
  pushPage(location.href);

  const pusher = new Pusher(PUSHER_KEY!, {
    cluster: PUSHER_CLUSTER!,
    forceTLS: true,
    disableStats: true,
    enabledTransports: ["ws", "wss"],
    disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],
    channelAuthorization: {
      endpoint: PUSHER_AUTH_URL!,
      transport: "ajax",
      params: { orgId, sessionId: contactSessionId },
    } as any,
  });

  pusherRef = pusher;

  const channelName = `presence-org_${orgId}_session_${contactSessionId}`;
  const channel = pusher.subscribe(channelName) as Channel;
  channelRef = channel;

  let stopPresence: (() => void) | null = null;

  channel.bind("server-start-rrweb", () => {
    if (rrwebWatching) return;
    rrwebWatching = true;

    // make sure Live can show "current page" even before rrweb starts streaming
    persistPresenceNow(orgId, contactSessionId);

    startRrwebRecorder(orgId, contactSessionId);
  });

  channel.bind("server-stop-rrweb", () => {
    rrwebWatching = false;
    stopRrwebOnly();
  });

  channel.bind("pusher:subscription_succeeded", () => {
    startPerfWatchdog();
    setupCursor();

    stopPresence = startPresenceHeartbeat(orgId, contactSessionId);

    const startedAt = now();
    sessionStopTimer = setInterval(() => {
      if (!started) return;
      if (!rrwebWatching) return;
      if (now() - startedAt > MAX_SESSION_MS) {
        rrwebWatching = false;
        stopRrwebOnly();
        if (sessionStopTimer) {
          clearInterval(sessionStopTimer);
          sessionStopTimer = null;
        }
      }
    }, 10_000);

    unpatchHistory = patchHistoryForUrlChanges(() => {
      const href = location.href;
      if (!href || href === lastHref) return;

      lastHref = href;
      markActivity();

      // Option B: persist only via /visit
      persistPresenceNow(orgId, contactSessionId);

      if (!rrwebWatching) return;
      restartRrwebRecorderDebounced(orgId, contactSessionId);
    });

    attachUnloadHandlers();
  });

  channel.bind("pusher:subscription_error", () => {
    try {
      stopPresence?.();
    } catch {}
    stopPresence = null;
    cleanup();
  });
}