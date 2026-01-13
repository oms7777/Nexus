// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "@rrweb/types";
import Pusher from "pusher-js";
import type { Channel } from "pusher-js";

let started = false;

let pusherRef: Pusher | null = null;
let channelRef: Channel | null = null;

// rrweb record() peut retourner undefined
let stopRecording: listenerHandler | undefined;

// timers / unsub
let flushTimer: number | null = null;
let uninstallNav: (() => void) | null = null;

// ✅ mousemove listener ref (avoid leaks)
let onMouseMoveRef: ((e: MouseEvent) => void) | null = null;

let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];

// Live batching
let liveQueue: eventWithTime[] = [];
let flushing = false;

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string;
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// Pusher limit ~10KB per client event
const MAX_EVENT_BYTES = 9_000;

// Flush cadence
const FLUSH_EVERY_MS = 250;

// ✅ Memory safety caps
const MAX_SNAPSHOT_BUFFER_EVENTS = 900;
const MAX_QUEUE_EVENTS = 400;

// ✅ Snapshot throttling
const SNAPSHOT_COOLDOWN_MS = 1600;
let lastSnapshotTs = 0;

// ✅ Cursor throttling
const CURSOR_THROTTLE_MS = 60;
let lastCursorTs = 0;

// ✅ Track nav changes
let lastHref: string | null = null;
let lastNavSnapshotRequestTs = 0;
const NAV_SNAPSHOT_THROTTLE_MS = 1200;

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

  // ✅ remove mousemove listener always (prevents leaks)
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
  lastCursorTs = 0;
  lastHref = null;
  lastNavSnapshotRequestTs = 0;

  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

/* ---------------- cursor ---------------- */

function normalizeCursor(e: MouseEvent) {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  const x = Math.min(1, Math.max(0, e.clientX / w));
  const y = Math.min(1, Math.max(0, e.clientY / h));
  return { x, y };
}

function triggerCursor(e: MouseEvent) {
  if (!channelRef) return;

  const now = Date.now();
  if (now - lastCursorTs < CURSOR_THROTTLE_MS) return;
  lastCursorTs = now;

  try {
    channelRef.trigger("client-cursor", normalizeCursor(e));
  } catch {}
}

/* ---------------- snapshot posting ---------------- */

async function postSnapshot(
  orgId: string,
  sessionId: string,
  events: eventWithTime[]
) {
  if (!events.length) return;

  const now = Date.now();
  if (now - lastSnapshotTs < SNAPSHOT_COOLDOWN_MS) return;
  lastSnapshotTs = now;

  // ✅ hard safety: keep from FullSnapshot and trim tail
  const fullIndex = events.findIndex((e) => e.type === 2);
  if (fullIndex > 0) events = events.slice(fullIndex);

  if (events.length > 900) {
    const full = events.find((e) => e.type === 2);
    const tail = events.slice(-400);
    events = full ? [full, ...tail] : tail;
  }

  const body = JSON.stringify({ organizationId: orgId, sessionId, events });
  if (safeBytes(body) > 1_700_000) {
    const full = events.find((e) => e.type === 2);
    const tail = events.slice(-200);
    const smaller = full ? [full, ...tail] : tail;

    try {
      await fetch(SNAPSHOT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          sessionId,
          events: smaller,
        }),
        keepalive: true,
        mode: "cors",
      });
    } catch {}
    return;
  }

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

/* ---------------- SPA navigation watcher ---------------- */

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

/* ---------------- main init ---------------- */

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

    flushing = true;
    try {
      const chunk = liveQueue.splice(0, 90);
      const filtered = chunk.filter((e) => e.type !== 2);
      if (!filtered.length) return;

      const payload = { events: filtered };
      const json = JSON.stringify(payload);
      const bytes = safeBytes(json);

      if (bytes > MAX_EVENT_BYTES) {
        // trop gros => on drop ce batch (safety)
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

  // ---- cursor stream ----
  onMouseMoveRef = (e: MouseEvent) => triggerCursor(e);
  window.addEventListener("mousemove", onMouseMoveRef, { passive: true });

  // ---- rrweb recording ----
  channel.bind("pusher:subscription_succeeded", () => {
    // ✅ navigation watcher -> request new FullSnapshot (throttled) + reset gating
    uninstallNav = installNavigationWatcher(() => {
      const now = Date.now();
      if (now - lastNavSnapshotRequestTs < NAV_SNAPSHOT_THROTTLE_MS) return;
      lastNavSnapshotRequestTs = now;

      // ✅ CRITICAL: allow next FullSnapshot to be accepted and posted
      snapshotSent = false;
      snapshotBuffer = [];

      try {
        if (typeof (record as any).takeFullSnapshot === "function") {
          (record as any).takeFullSnapshot();
        }
      } catch {}
    });

    stopRecording = record({
      sampling: {
        mousemove: 140,
        mouseInteraction: true,
        scroll: 180,
        input: "last",
      },
      emit(event: eventWithTime) {
        try {
          const isFullSnapshot = event.type === 2;

          // buffer until we post a snapshot
          if (!snapshotSent) {
            snapshotBuffer.push(event);
            if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER_EVENTS) {
              snapshotBuffer.splice(
                0,
                snapshotBuffer.length - MAX_SNAPSHOT_BUFFER_EVENTS
              );
            }
          }

          // ✅ post snapshot when we get a FullSnapshot after reset (or first time)
          if (isFullSnapshot && !snapshotSent) {
            snapshotSent = true;

            const snapshotEvents = [...snapshotBuffer];
            snapshotBuffer = [];

            void postSnapshot(orgId, sessionId, snapshotEvents);
            return; // never stream FullSnapshot over pusher
          }

          // no live streaming until first snapshot posted
          if (!snapshotSent) return;

          // never send FullSnapshot via pusher
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
