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

let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];

let liveQueue: eventWithTime[] = [];
let flushing = false;

let onMouseMoveRef: ((e: MouseEvent) => void) | null = null;

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string;
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// ---------- SAFETY / PERF ----------
const MAX_EVENT_BYTES = 8_500;

// ✅ much less aggressive
const FLUSH_EVERY_MS = 450;
const CURSOR_THROTTLE_MS = 120;

// ✅ hard memory caps (lower than before)
const MAX_SNAPSHOT_BUFFER_EVENTS = 350;
const MAX_QUEUE_EVENTS = 220;

// ✅ snapshot rate limit
const SNAPSHOT_COOLDOWN_MS = 2500;
let lastSnapshotTs = 0;

// ✅ nav snapshot request throttling
const NAV_SNAPSHOT_THROTTLE_MS = 2500;
let lastNavSnapshotRequestTs = 0;

// ✅ circuit breaker: if queue keeps exploding, stop tracking
const QUEUE_OVERFLOW_HARD_LIMIT = 650;
let overflowStrikes = 0;
const MAX_OVERFLOW_STRIKES = 3;

// ✅ avoid heavy work on hidden tabs
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
  snapshotSent = false;
  flushing = false;

  lastSnapshotTs = 0;
  lastNavSnapshotRequestTs = 0;
  overflowStrikes = 0;

  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

// ---------------- cursor ----------------

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

// ---------------- snapshot posting ----------------

async function postSnapshot(orgId: string, sessionId: string, events: eventWithTime[]) {
  if (!events.length) return;

  const now = Date.now();
  if (now - lastSnapshotTs < SNAPSHOT_COOLDOWN_MS) return;
  lastSnapshotTs = now;

  // keep from first FullSnapshot and trim tail hard
  const fullIndex = events.findIndex((e) => e.type === 2);
  if (fullIndex > 0) events = events.slice(fullIndex);

  // hard trim
  if (events.length > 420) {
    const full = events.find((e) => e.type === 2);
    const tail = events.slice(-220);
    events = full ? [full, ...tail] : tail;
  }

  try {
    await fetch(SNAPSHOT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, sessionId, events }),
      keepalive: true,
      mode: "cors",
    });
  } catch {}
}

// ---------------- SPA nav watcher (light) ----------------

let lastHref: string | null = null;

function installNavigationWatcher(onChange: (href: string) => void) {
  if (typeof window === "undefined") return () => {};

  const emitIfChanged = () => {
    const href = window.location.href;
    if (href !== lastHref) {
      lastHref = href;
      onChange(href);
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

// ---------------- main init ----------------

export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // never track inside widget iframe
  if (window.self !== window.top) return;

  started = true;
  purgePusherTransportCache();

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

  // ---- live flush ----
  const flush = () => {
    if (!channelRef) return;
    if (!snapshotSent) return;
    if (flushing) return;
    if (liveQueue.length === 0) return;
    if (isHidden()) return;

    // circuit breaker: too much => stop
    if (liveQueue.length > QUEUE_OVERFLOW_HARD_LIMIT) {
      overflowStrikes++;
      liveQueue = liveQueue.slice(-MAX_QUEUE_EVENTS); // keep tail
      if (overflowStrikes >= MAX_OVERFLOW_STRIKES) {
        cleanup();
      }
      return;
    }

    flushing = true;

    try {
      const chunk = liveQueue.splice(0, 70);
      const filtered = chunk.filter((e) => e.type !== 2);
      if (!filtered.length) return;

      const payload = { events: filtered };
      const json = JSON.stringify(payload);

      if (safeBytes(json) > MAX_EVENT_BYTES) {
        // too big => drop this batch
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

  // ---- cursor stream (optional but cheap) ----
  onMouseMoveRef = (e: MouseEvent) => triggerCursor(e);
  window.addEventListener("mousemove", onMouseMoveRef, { passive: true });

  channel.bind("pusher:subscription_succeeded", () => {
    // ✅ on nav: DO NOT call takeFullSnapshot (can freeze)
    // Instead: allow next FullSnapshot if rrweb emits one naturally
    // And request a snapshot post from buffer the moment a FullSnapshot appears.
    uninstallNav = installNavigationWatcher(() => {
      const now = Date.now();
      if (now - lastNavSnapshotRequestTs < NAV_SNAPSHOT_THROTTLE_MS) return;
      lastNavSnapshotRequestTs = now;

      // allow next FullSnapshot to be accepted
      snapshotSent = false;
      snapshotBuffer = [];
    });

    stopRecording = record({
      sampling: {
        // ✅ less heavy
        mousemove: 220,
        mouseInteraction: true,
        scroll: 260,
        input: "last",
      },
      emit(event: eventWithTime) {
        try {
          if (isHidden()) return;

          const isFullSnapshot = event.type === 2;

          // buffer until snapshot posted
          if (!snapshotSent) {
            snapshotBuffer.push(event);
            if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER_EVENTS) {
              snapshotBuffer.splice(0, snapshotBuffer.length - MAX_SNAPSHOT_BUFFER_EVENTS);
            }
          }

          // post snapshot on first FullSnapshot after reset / first time
          if (isFullSnapshot && !snapshotSent) {
            snapshotSent = true;
            const snapshotEvents = [...snapshotBuffer];
            snapshotBuffer = [];
            void postSnapshot(orgId, sessionId, snapshotEvents);
            return; // never stream FullSnapshot
          }

          if (!snapshotSent) return;
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
    cleanup();
  });

  pusher.connection.bind("disconnected", () => {
    cleanup();
  });
}
