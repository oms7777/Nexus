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
let uninstallNav: (() => void) | null = null;
let onMouseMoveRef: ((e: MouseEvent) => void) | null = null;

let convexSessionId: string | null = null;

// snapshot state
let snapshotSentOnce = false;
let snapshotBuffer: eventWithTime[] = [];
let wantNewSnapshot = false;

// live batching
let liveQueue: eventWithTime[] = [];
let flushing = false;

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string; // external (can be uuid) — kept for backward compat, but NOT used for storage/pusher
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";

// ✅ your Next routes
const ENSURE_SESSION_URL = "https://app.inboundless.co/api/tracker/ensure-session";
const SET_CURRENT_URL = "https://app.inboundless.co/api/tracker/set-current-url";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// ---------- PERF ----------
const MAX_EVENT_BYTES = 8_500;

// less aggressive
const FLUSH_EVERY_MS = 450;
const CURSOR_THROTTLE_MS = 120;

// caps mémoire
const MAX_SNAPSHOT_BUFFER_EVENTS = 420;
const MAX_QUEUE_EVENTS = 260;

// snapshot rate limit (if you ever want refresh snapshots)
const SNAPSHOT_COOLDOWN_MS = 12_000;
let lastSnapshotTs = 0;

// nav throttling
const NAV_URL_THROTTLE_MS = 650;
let lastNavUrlTs = 0;

// optional snapshot refresh on nav (VERY rare)
const NAV_SNAPSHOT_THROTTLE_MS = 60_000; // 1 min
let lastNavSnapshotTs = 0;

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

function purgePusherTransportCache() {
  try {
    localStorage.removeItem("pusherTransportTLS");
    localStorage.removeItem("pusherTransportNonTLS");
  } catch {}
}

function cleanup() {
  try {
    stopRecording?.();
  } catch {}
  stopRecording = undefined;

  if (flushTimer) {
    window.clearInterval(flushTimer);
    flushTimer = null;
  }

  if (uninstallNav) {
    try {
      uninstallNav();
    } catch {}
    uninstallNav = null;
  }

  if (onMouseMoveRef) {
    try {
      window.removeEventListener("mousemove", onMouseMoveRef);
    } catch {}
    onMouseMoveRef = null;
  }

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
  flushing = false;

  snapshotSentOnce = false;
  wantNewSnapshot = false;

  convexSessionId = null;
  lastSnapshotTs = 0;
  lastNavUrlTs = 0;
  lastNavSnapshotTs = 0;

  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

/* ---------------- cursor ---------------- */

let lastCursorTs = 0;

function normalizeCursor(e: MouseEvent) {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  return {
    x: Math.min(1, Math.max(0, e.clientX / w)),
    y: Math.min(1, Math.max(0, e.clientY / h)),
  };
}

function triggerCursor(e: MouseEvent) {
  if (!channelRef) return;
  if (isHidden()) return;

  const now = Date.now();
  if (now - lastCursorTs < CURSOR_THROTTLE_MS) return;
  lastCursorTs = now;

  try {
    channelRef.trigger("client-cursor", normalizeCursor(e));
  } catch {}
}

/* ---------------- Convex session bootstrap ---------------- */

async function ensureConvexSession(orgId: string) {
  // ✅ cache per-tab (and across reloads)
  try {
    const cached = localStorage.getItem("inboundless_convex_session_id");
    if (cached) return cached;
  } catch {}

  try {
    const res = await fetch(ENSURE_SESSION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      mode: "cors",
      body: JSON.stringify({
        organizationId: orgId,
        // no convexSessionId => create/reuse anonymous server-side
        metadata: {
          currentUrl: window.location.href,
          title: document.title,
          referrer: document.referrer || undefined,
          viewportSize: `${window.innerWidth}x${window.innerHeight}`,
          screenResolution: `${screen.width}x${screen.height}`,
          language: navigator.language,
          cookieEnabled: navigator.cookieEnabled,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          timezoneOffset: -new Date().getTimezoneOffset(),
        },
      }),
      keepalive: true,
    });

    const json = (await res.json()) as { ok: boolean; sessionId?: string };
    if (!json?.ok || !json.sessionId) return null;

    try {
      localStorage.setItem("inboundless_convex_session_id", json.sessionId);
    } catch {}

    return json.sessionId;
  } catch {
    return null;
  }
}

/* ---------------- URL tracking (no-freeze) ---------------- */

async function postCurrentUrl(convexId: string) {
  const now = Date.now();
  if (now - lastNavUrlTs < NAV_URL_THROTTLE_MS) return;
  lastNavUrlTs = now;

  try {
    await fetch(SET_CURRENT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      mode: "cors",
      body: JSON.stringify({
        sessionId: convexId,
        url: window.location.href,
        title: document.title,
        referrer: document.referrer || undefined,
      }),
      keepalive: true,
    });
  } catch {}
}

/* ---------------- snapshot posting ---------------- */

async function postSnapshot(orgId: string, convexId: string, events: eventWithTime[]) {
  if (!events.length) return;

  const now = Date.now();
  if (now - lastSnapshotTs < SNAPSHOT_COOLDOWN_MS) return;
  lastSnapshotTs = now;

  // keep from first FullSnapshot + small tail
  const fullIndex = events.findIndex((e) => e.type === 2);
  if (fullIndex > 0) events = events.slice(fullIndex);

  if (events.length > 520) {
    const full = events.find((e) => e.type === 2);
    const tail = events.slice(-260);
    events = full ? [full, ...tail] : tail;
  }

  const body = JSON.stringify({ organizationId: orgId, sessionId: convexId, events });
  if (safeBytes(body) > 1_000_000) return; // hard safety

  try {
    await fetch(SNAPSHOT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      mode: "cors",
    });
  } catch {}
}

/* ---------------- SPA nav watcher ---------------- */

let lastHref: string | null = null;

function installNavigationWatcher(onChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const emitIfChanged = () => {
    const href = window.location.href;
    if (href !== lastHref) {
      lastHref = href;
      onChange();
    }
  };

  const originalPush = window.history.pushState.bind(window.history);
  const originalReplace = window.history.replaceState.bind(window.history);

  const patchedPush: History["pushState"] = (...args) => {
    originalPush(...args);
    emitIfChanged();
  };
  const patchedReplace: History["replaceState"] = (...args) => {
    originalReplace(...args);
    emitIfChanged();
  };

  try {
    window.history.pushState = patchedPush;
    window.history.replaceState = patchedReplace;
  } catch {}

  window.addEventListener("popstate", emitIfChanged);
  window.addEventListener("hashchange", emitIfChanged);

  emitIfChanged();

  return () => {
    try {
      window.history.pushState = originalPush;
      window.history.replaceState = originalReplace;
    } catch {}
    window.removeEventListener("popstate", emitIfChanged);
    window.removeEventListener("hashchange", emitIfChanged);
  };
}

// ❗ optional: snapshot refresh very rarely (and only idle)
function requestRareNavSnapshot() {
  const now = Date.now();
  if (now - lastNavSnapshotTs < NAV_SNAPSHOT_THROTTLE_MS) return;
  lastNavSnapshotTs = now;

  // we only refresh snapshot if rrweb gives a full snapshot naturally
  wantNewSnapshot = true;
  snapshotBuffer = [];
}

/* ---------------- main init ---------------- */

export async function initVisitorTracking({ orgId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // never track inside widget iframe
  if (window.self !== window.top) return;

  started = true;
  purgePusherTransportCache();

  // ✅ CRITICAL: get a REAL Convex sessionId first
  convexSessionId = await ensureConvexSession(orgId);
  if (!convexSessionId) {
    cleanup();
    return;
  }

  // push current url immediately
  void postCurrentUrl(convexSessionId);

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

  // ✅ IMPORTANT: channel uses convexSessionId (so UI listens to the same)
  const channelName = `presence-org_${orgId}_session_${convexSessionId}`;
  const channel = pusher.subscribe(channelName) as Channel;
  channelRef = channel;

  // ---- live flush ----
  const flush = () => {
    if (!channelRef) return;
    if (!snapshotSentOnce) return;
    if (flushing) return;
    if (liveQueue.length === 0) return;
    if (isHidden()) return;

    flushing = true;
    try {
      const chunk = liveQueue.splice(0, 70);
      const filtered = chunk.filter((e) => e.type !== 2);
      if (!filtered.length) return;

      const payload = { events: filtered };
      const json = JSON.stringify(payload);

      if (safeBytes(json) > MAX_EVENT_BYTES) return;

      channelRef.trigger("client-rrweb", payload);
    } catch {
      // ignore
    } finally {
      flushing = false;
    }
  };

  flushTimer = window.setInterval(flush, FLUSH_EVERY_MS);

  // ---- cursor ----
  onMouseMoveRef = (e: MouseEvent) => triggerCursor(e);
  window.addEventListener("mousemove", onMouseMoveRef, { passive: true });

  channel.bind("pusher:subscription_succeeded", () => {
    // ✅ Nav watcher: URL updates (cheap) + ultra-rare snapshot refresh request
    uninstallNav = installNavigationWatcher(() => {
      if (!convexSessionId) return;
      void postCurrentUrl(convexSessionId);
      requestRareNavSnapshot();
    });

    stopRecording = record({
      sampling: {
        mousemove: 260,
        mouseInteraction: true,
        scroll: 320,
        input: "last",
      },
      emit(event: eventWithTime) {
        try {
          if (isHidden()) return;

          const isFullSnapshot = event.type === 2;

          // 1) first snapshot ever
          if (!snapshotSentOnce) {
            snapshotBuffer.push(event);
            if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER_EVENTS) {
              snapshotBuffer.splice(0, snapshotBuffer.length - MAX_SNAPSHOT_BUFFER_EVENTS);
            }

            if (isFullSnapshot && convexSessionId) {
              snapshotSentOnce = true;
              const snapshotEvents = [...snapshotBuffer];
              snapshotBuffer = [];
              void postSnapshot(orgId, convexSessionId, snapshotEvents);
              return; // never stream FullSnapshot
            }
            return;
          }

          // 2) optional nav refresh snapshots (rare) — does NOT block live
          if (wantNewSnapshot) {
            snapshotBuffer.push(event);
            if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER_EVENTS) {
              snapshotBuffer.splice(0, snapshotBuffer.length - MAX_SNAPSHOT_BUFFER_EVENTS);
            }

            if (isFullSnapshot && convexSessionId) {
              wantNewSnapshot = false;
              const snapshotEvents = [...snapshotBuffer];
              snapshotBuffer = [];
              void postSnapshot(orgId, convexSessionId, snapshotEvents);
              return;
            }
          }

          // 3) normal live
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

  channel.bind("pusher:subscription_error", () => cleanup());
  pusher.connection.bind("disconnected", () => cleanup());
}
