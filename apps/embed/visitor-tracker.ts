// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "@rrweb/types";
import Pusher from "pusher-js";
import type { Channel } from "pusher-js";

let started = false;

let pusherRef: Pusher | null = null;
let channelRef: Channel | null = null;

// record() peut retourner undefined selon la version rrweb
let stopRecording: listenerHandler | undefined;

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

// Pusher limit ~10KB per client event -> keep margin
const MAX_EVENT_BYTES = 9_000;

// Flush cadence (batch)
const FLUSH_EVERY_MS = 250;

// Safety caps
const MAX_SNAPSHOT_BUFFER_EVENTS = 6_000;
const MAX_QUEUE_EVENTS = 1_500;

// ----- NEW: navigation + snapshot refresh -----
const SNAPSHOT_COOLDOWN_MS = 1200;
let lastSnapshotTs = 0;
let lastHref: string | null = null;

// ----- NEW: cursor live -----
const CURSOR_THROTTLE_MS = 60;
let lastCursorTs = 0;

function safeBytes(str: string) {
  return new TextEncoder().encode(str).length;
}

function purgePusherTransportCache() {
  try {
    localStorage.removeItem("pusherTransportTLS");
    localStorage.removeItem("pusherTransportNonTLS");
  } catch {
    // ignore
  }
}

function cleanup() {
  try {
    stopRecording?.();
  } catch {}
  stopRecording = undefined;

  try {
    channelRef?.unbind_all();
  } catch {}
  channelRef = null;

  try {
    pusherRef?.disconnect();
  } catch {}
  pusherRef = null;

  // reset state
  liveQueue = [];
  snapshotBuffer = [];
  snapshotSent = false;
  flushing = false;

  lastSnapshotTs = 0;
  lastHref = null;
  lastCursorTs = 0;

  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

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
    const pos = normalizeCursor(e);
    channelRef.trigger("client-cursor", pos);
  } catch {
    // ignore
  }
}

async function postSnapshot(orgId: string, sessionId: string, events: eventWithTime[]) {
  if (!events.length) return;

  // extra safety: don't post too frequently
  const now = Date.now();
  if (now - lastSnapshotTs < SNAPSHOT_COOLDOWN_MS) return;
  lastSnapshotTs = now;

  try {
    await fetch(SNAPSHOT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: orgId,
        sessionId,
        events,
      }),
      keepalive: true,
      mode: "cors",
    });
  } catch {
    // ignore
  }
}

function installNavigationWatcher(onChange: (href: string) => void) {
  if (typeof window === "undefined") return () => {};

  const emitIfChanged = () => {
    const href = window.location.href;
    if (href !== lastHref) {
      lastHref = href;
      onChange(href);
    }
  };

  // patch pushState/replaceState
  const { pushState, replaceState } = window.history;

  const patchedPushState: History["pushState"] = (...args) => {
    const ret = pushState.apply(window.history, args as any);
    emitIfChanged();
    return ret;
  };

  const patchedReplaceState: History["replaceState"] = (...args) => {
    const ret = replaceState.apply(window.history, args as any);
    emitIfChanged();
    return ret;
  };

  try {
    window.history.pushState = patchedPushState;
    window.history.replaceState = patchedReplaceState;
  } catch {
    // ignore
  }

  window.addEventListener("popstate", emitIfChanged);
  window.addEventListener("hashchange", emitIfChanged);

  // initial
  emitIfChanged();

  return () => {
    try {
      window.history.pushState = pushState;
      window.history.replaceState = replaceState;
    } catch {}
    window.removeEventListener("popstate", emitIfChanged);
    window.removeEventListener("hashchange", emitIfChanged);
  };
}

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

    // WS only
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
      const chunk = liveQueue.splice(0, 120);

      // Never send FullSnapshot over Pusher
      const filtered = chunk.filter((e) => e.type !== 2);
      if (filtered.length === 0) return;

      const payload = { events: filtered };
      const json = JSON.stringify(payload);
      const bytes = safeBytes(json);

      // Split if too big
      if (bytes > MAX_EVENT_BYTES && filtered.length > 1) {
        liveQueue.unshift(...filtered);
        const half = Math.ceil(filtered.length / 2);

        const a = liveQueue.splice(0, half);
        const b = liveQueue.splice(0, half);

        liveQueue.unshift(...b);
        liveQueue.unshift(...a);
        return;
      }

      // If one event too big -> skip
      if (bytes > MAX_EVENT_BYTES && filtered.length === 1) return;

      channelRef.trigger("client-rrweb", payload);
    } catch {
      // ignore
    } finally {
      flushing = false;
    }
  };

  const timer = window.setInterval(flush, FLUSH_EVERY_MS);

  // ---- NEW: cursor stream ----
  const onMouseMove = (e: MouseEvent) => triggerCursor(e);
  window.addEventListener("mousemove", onMouseMove, { passive: true });

  // ---- NEW: nav watcher -> request a new snapshot after navigation ----
  const uninstallNav = installNavigationWatcher(() => {
    // rrweb will emit a FullSnapshot on some navigations, but SPA often doesn't.
    // We force-refresh by resetting snapshotSent and buffering until next FullSnapshot,
    // AND we also post a "best-effort" snapshot from current buffer if we already have one.
    snapshotSent = false;
    snapshotBuffer = [];
    // after resetting, rrweb typically emits a FullSnapshot soon due to DOM mutations;
    // if it doesn't, user interactions will still generate incrementals, but snapshot may remain old.
    // We keep this simple; the next FullSnapshot will be posted by the emit() logic below.
  });

  channel.bind("pusher:subscription_succeeded", () => {
    stopRecording = record({
      sampling: {
        mousemove: 120,
        mouseInteraction: true,
        scroll: 150,
        input: "last",
      },
      emit(event: eventWithTime) {
        try {
          const isFullSnapshot = event.type === 2;

          // Buffer early events until snapshot is sent
          if (!snapshotSent) {
            snapshotBuffer.push(event);

            if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER_EVENTS) {
              snapshotBuffer.splice(
                0,
                snapshotBuffer.length - MAX_SNAPSHOT_BUFFER_EVENTS
              );
            }
          }

          // FullSnapshot -> send snapshot to backend
          if (isFullSnapshot && !snapshotSent) {
            snapshotSent = true;

            const snapshotEvents = [...snapshotBuffer];
            snapshotBuffer = [];

            void postSnapshot(orgId, sessionId, snapshotEvents);

            return; // do not enqueue FullSnapshot for live
          }

          // until snapshot sent, no live streaming
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
    window.clearInterval(timer);
    window.removeEventListener("mousemove", onMouseMove);
    uninstallNav();
    cleanup();
  });

  pusher.connection.bind("disconnected", () => {
    window.clearInterval(timer);
    window.removeEventListener("mousemove", onMouseMove);
    uninstallNav();
    cleanup();
  });
}
