import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "rrweb/typings/types";
import Pusher, { type Channel } from "pusher-js";

type VisitorTrackingOptions = {
  orgId: string;
  contactSessionId: string;
};

// =======================
// Config
// =======================
const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";

// ✅ Snapshot meta endpoint (your route.ts)
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// ✅ NEW: endpoint to persist visited pages + currentUrl/title/lastSeenAt
// You will create this route in your app (I tell you below).
const VISIT_URL = "https://app.inboundless.co/api/tracker/visit";

// Pusher client events payload limit ~10KB
const MAX_PAYLOAD_BYTES = 9_000;

// batching
const BATCH_INTERVAL_MS = 250;
const MAX_BATCH_EVENTS = 25;

// snapshot persist debounce
const SNAPSHOT_DEBOUNCE_MS = 350;

// URL-change -> restart recorder (reliable full snapshot)
const URL_CHANGE_DEBOUNCE_MS = 250;
const MIN_RESTART_INTERVAL_MS = 3000;

// activity / idle control
const IDLE_PAUSE_MS = 60_000;

// safety limits
const MAX_SESSION_MS = 12 * 60 * 1000; // 12 minutes max rrweb running when enabled
const MAX_TOTAL_EVENTS = 25_000;

// perf watchdog (stop rrweb if host is too slow)
const WATCHDOG_INTERVAL_MS = 30_000;
const MAX_LONGTASKS_PER_WINDOW = 8;

// ✅ NEW: visited pages controls
const PAGES_MAX = 20;
const VISIT_DEBOUNCE_MS = 500;
const MIN_VISIT_INTERVAL_MS = 800;

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

// rrweb “watching” mode
let rrwebWatching = false;

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

// ✅ NEW: pages tracking
let pages: string[] = [];
let visitDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastVisitPersistAt = 0;
let visitAbort: AbortController | null = null;

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

// =======================
// Helpers: URL normalization / dedup
// =======================
function normalizeUrl(u: string) {
  try {
    // keep query params (utm etc) because you want them in filtering
    // but normalize hash (often noisy)
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

  // move-to-end if already exists
  const idx = pages.indexOf(clean);
  if (idx >= 0) pages.splice(idx, 1);

  pages.push(clean);

  if (pages.length > PAGES_MAX) {
    pages.splice(0, pages.length - PAGES_MAX);
  }
}

// =======================
// Networking: Pusher (rrweb)
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

// =======================
// ✅ Networking: persist snapshot meta (your /api/tracker/snapshot)
// =======================
function persistSnapshotMetaDebounced(opts: {
  orgId: string;
  sessionId: string;
  pageUrl: string;
  title?: string;
  width?: number;
  height?: number;
}) {
  if (snapshotDebounceTimer) clearTimeout(snapshotDebounceTimer);

  snapshotDebounceTimer = setTimeout(async () => {
    snapshotDebounceTimer = null;

    try {
      snapshotAbort?.abort();
    } catch {}
    snapshotAbort = new AbortController();

    // POST first, fallback GET pixel
    try {
      await fetch(SNAPSHOT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: snapshotAbort.signal,
        body: JSON.stringify({
          organizationId: opts.orgId,
          sessionId: opts.sessionId,
          pageUrl: opts.pageUrl,
          title: opts.title,
          width: opts.width,
          height: opts.height,
        }),
      });
    } catch {
      try {
        const u = new URL(SNAPSHOT_URL);
        u.searchParams.set("organizationId", opts.orgId);
        u.searchParams.set("sessionId", opts.sessionId);
        u.searchParams.set("pageUrl", opts.pageUrl);
        if (opts.title) u.searchParams.set("title", opts.title);
        if (typeof opts.width === "number") u.searchParams.set("width", String(opts.width));
        if (typeof opts.height === "number") u.searchParams.set("height", String(opts.height));

        const img = new Image();
        img.src = u.toString();
      } catch {
        // silent
      }
    }
  }, SNAPSHOT_DEBOUNCE_MS);
}

// =======================
// ✅ Networking: persist visited pages + currentUrl/title/lastSeenAt
// This requires creating /api/tracker/visit route (below I explain).
// =======================
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
    } catch {
      // best effort
    }
  }, VISIT_DEBOUNCE_MS);
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

  // drop buffered work
  resetRecorderStateForNewPage();
}

function startRrwebRecorder(orgId: string, sessionId: string) {
  // stop previous rrweb only (keep pusher/channel)
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
        if (t !== 4 && t !== 2) return;
      }

      markActivity();

      const type = (event as any)?.type;
      if (type === 4) lastMeta = event;

      const isFullSnapshot = type === 2;

      if (!snapshotSent) snapshotBuffer.push(event);

      // ✅ Keep your live replay behavior unchanged (Pusher)
      if (isFullSnapshot) {
        if (!snapshotSent) {
          snapshotSent = true;

          const snap = [...snapshotBuffer];
          snapshotBuffer = [];

          const hasMeta = snap.some((e: any) => e?.type === 4);
          const payloadEvents = !hasMeta && lastMeta ? [lastMeta, ...snap] : snap;

          // send to viewers immediately
          try {
            channelRef?.trigger("client-snapshot", { events: payloadEvents });
          } catch {}

          // ✅ Also persist meta snapshot (not rrweb) so Live panel always has URL/title
          persistSnapshotMetaDebounced({
            orgId,
            sessionId,
            pageUrl: location.href,
            title: document.title,
            width: window.innerWidth,
            height: window.innerHeight,
          });

          return;
        }

        const payloadEvents = lastMeta ? [lastMeta, event] : [event];

        try {
          channelRef?.trigger("client-snapshot", { events: payloadEvents });
        } catch {}

        // persist meta snapshot
        persistSnapshotMetaDebounced({
          orgId,
          sessionId,
          pageUrl: location.href,
          title: document.title,
          width: window.innerWidth,
          height: window.innerHeight,
        });

        return;
      }

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

  // best-effort snapshot quickly
  const doSnapshot = () => {
    if (!stopRecording) return;
    try {
      (record as any).takeFullSnapshot?.();
    } catch {}
  };

  if ("requestIdleCallback" in window) {
    // @ts-ignore
    (window as any).requestIdleCallback(doSnapshot, { timeout: 2000 });
  } else {
    setTimeout(doSnapshot, 1500);
  }
}

function restartRrwebRecorderDebounced(orgId: string, sessionId: string) {
  if (!channelRef) return;
  if (!rrwebWatching) return;
  if (!stopRecording) return; // rrweb currently off

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
      stopRrwebOnly(); // cursor-only fallback
      rrwebWatching = false;
    }

    longTaskCount = 0;
  }, WATCHDOG_INTERVAL_MS);
}

// =======================
// ✅ Pages / presence tracking
// =======================
function persistPresenceNow(orgId: string, sessionId: string) {
  try {
    const href = location.href;
    const title = document.title;
    const ts = now();

    pushPage(href);

    // update session metadata (pages/currentUrl/title/lastSeenAt)
    persistVisitToDbDebounced({
      orgId,
      sessionId,
      pageUrl: href,
      title,
      pages: [...pages],
      lastSeenAt: ts,
    });

    // store snapshot meta for Live panel (clickable)
    persistSnapshotMetaDebounced({
      orgId,
      sessionId,
      pageUrl: href,
      title,
      width: window.innerWidth,
      height: window.innerHeight,
    });
  } catch {
    // silent
  }
}

function startPresenceHeartbeat(orgId: string, sessionId: string) {
  // fire once immediately
  persistPresenceNow(orgId, sessionId);

  // also refresh on visibility changes
  const onVis = () => {
    if (!document.hidden) persistPresenceNow(orgId, sessionId);
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    try {
      document.removeEventListener("visibilitychange", onVis);
    } catch {}
  };
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
      snapshotAbort?.abort();
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

// =======================
// Full cleanup (embed destroyed / session ends)
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

  if (visitDebounceTimer) {
    try {
      clearTimeout(visitDebounceTimer);
    } catch {}
  }
  visitDebounceTimer = null;

  try {
    snapshotAbort?.abort();
  } catch {}
  snapshotAbort = null;

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

// =======================
// Init
// =======================
export function initVisitorTracking({ orgId, contactSessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // never track inside widget iframe
  if (window.self !== window.top) return;

  started = true;
  lastHref = location.href;
  lastActivityAt = now();
  totalEvents = 0;
  rrwebWatching = false;

  pages = [];
  pushPage(location.href);

  const pusher = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    forceTLS: true,
    disableStats: true,
    enabledTransports: ["ws", "wss"],
    disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],
    channelAuthorization: {
      endpoint: PUSHER_AUTH_URL,
      transport: "ajax",
      params: { orgId, sessionId: contactSessionId }, // ✅ AJOUT
    } as any,
  });

  pusherRef = pusher;

  const channelName = `presence-org_${orgId}_session_${contactSessionId}`;
  const channel = pusher.subscribe(channelName);
  channelRef = channel;

  let stopPresence: (() => void) | null = null;

  channel.bind("pusher:subscription_succeeded", () => {
    // watchdog
    startPerfWatchdog();

    // cursor always on
    setupCursor();

    // ✅ presence/meta always on
    stopPresence = startPresenceHeartbeat(orgId, contactSessionId);

    // ✅ rrweb NOT started by default anymore
    // it will start only on server-start-rrweb
    channel.bind("server-start-rrweb", () => {
      if (rrwebWatching) return;
      rrwebWatching = true;
      startRrwebRecorder(orgId, contactSessionId);
    });

    channel.bind("server-stop-rrweb", () => {
      rrwebWatching = false;
      stopRrwebOnly();
    });

    // stop rrweb after MAX_SESSION_MS (only when rrweb is ON)
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

    // SPA URL changes
    unpatchHistory = patchHistoryForUrlChanges(() => {
      const href = location.href;
      if (!href || href === lastHref) return;

      lastHref = href;
      markActivity();

      // ✅ always persist pages + currentUrl/title
      persistPresenceNow(orgId, contactSessionId);

      // rrweb restart only when rrweb is ON
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
