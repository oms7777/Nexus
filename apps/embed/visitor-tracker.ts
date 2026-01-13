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

/**
 * IMPORTANT:
 * - externalSessionId = string venant de l’embed (stable/random)
 * - convexSessionId  = vrai Id<contactSessions> retourné par /ensure-session
 */
let externalSessionIdRef: string | null = null;
let convexSessionIdRef: string | null = null;

// Snapshot state
let snapshotSentOnce = false;
let snapshotBuffer: eventWithTime[] = [];
let wantNewSnapshot = false;
let lastNavSnapshotRequestTs = 0;

// Live batching
let liveQueue: eventWithTime[] = [];
let flushing = false;

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string; // external session id (string)
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";
const ENSURE_SESSION_URL = "https://app.inboundless.co/api/tracker/ensure-session";

// ---------- SAFETY / PERF ----------
const MAX_EVENT_BYTES = 8_500;
const FLUSH_EVERY_MS = 450;
const CURSOR_THROTTLE_MS = 120;

const MAX_SNAPSHOT_BUFFER_EVENTS = 420;
const MAX_QUEUE_EVENTS = 260;

const SNAPSHOT_COOLDOWN_MS = 2500;
let lastSnapshotTs = 0;

const NAV_SNAPSHOT_THROTTLE_MS = 5000;

const QUEUE_OVERFLOW_HARD_LIMIT = 900;
let overflowStrikes = 0;
const MAX_OVERFLOW_STRIKES = 3;

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

  // reset queues/state
  liveQueue = [];
  snapshotBuffer = [];
  flushing = false;

  snapshotSentOnce = false;
  wantNewSnapshot = false;

  lastSnapshotTs = 0;
  lastNavSnapshotRequestTs = 0;
  overflowStrikes = 0;

  externalSessionIdRef = null;
  convexSessionIdRef = null;

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

/* ---------------- snapshot posting ---------------- */

async function postSnapshot(orgId: string, externalSessionId: string, events: eventWithTime[]) {
  if (!events.length) return;

  const now = Date.now();
  if (now - lastSnapshotTs < SNAPSHOT_COOLDOWN_MS) return;
  lastSnapshotTs = now;

  // trim: keep from first FullSnapshot + tail
  const fullIndex = events.findIndex((e) => e.type === 2);
  if (fullIndex > 0) events = events.slice(fullIndex);

  if (events.length > 520) {
    const full = events.find((e) => e.type === 2);
    const tail = events.slice(-260);
    events = full ? [full, ...tail] : tail;
  }

  try {
    await fetch(SNAPSHOT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: orgId,
        sessionId: externalSessionId, // ✅ IMPORTANT: string id for ensureByExternalId
        events,
      }),
      keepalive: true,
      mode: "cors",
    });
  } catch {}
}

/* ---------------- SPA nav watcher ---------------- */

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

function requestNavSnapshotSafely() {
  const now = Date.now();
  if (now - lastNavSnapshotRequestTs < NAV_SNAPSHOT_THROTTLE_MS) return;
  lastNavSnapshotRequestTs = now;

  wantNewSnapshot = true;
  snapshotBuffer = [];

  // takeFullSnapshot en idle (anti-freeze)
  try {
    const take = (record as unknown as { takeFullSnapshot?: () => void }).takeFullSnapshot;
    if (typeof take !== "function") return;

    const run = () => {
      try {
        take();
      } catch {}
    };

    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout?: number }) => number)
      | undefined;

    if (typeof ric === "function") ric(run, { timeout: 800 });
    else window.setTimeout(run, 120);
  } catch {}
}

/* ---------------- ENSURE SESSION (CRITICAL) ---------------- */

async function ensureConvexSessionId(orgId: string, externalSessionId: string) {
  try {
    const res = await fetch(ENSURE_SESSION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      mode: "cors",
      body: JSON.stringify({
        organizationId: orgId,
        externalSessionId,
        metadata: {
          currentUrl: typeof window !== "undefined" ? window.location.href : undefined,
          title: typeof document !== "undefined" ? document.title : undefined,
          viewportSize:
            typeof window !== "undefined"
              ? `${window.innerWidth}x${window.innerHeight}`
              : undefined,
          referrer: typeof document !== "undefined" ? document.referrer : undefined,
        },
      }),
    });

    const json = await res.json().catch(() => null);
    const id = json?.sessionId as string | undefined;
    return id || null;
  } catch {
    return null;
  }
}

/* ---------------- main init ---------------- */

export async function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;
  if (window.self !== window.top) return;

  started = true;
  purgePusherTransportCache();

  externalSessionIdRef = sessionId;

  // ✅ CRITICAL: get Convex session id BEFORE subscribing to Pusher
  convexSessionIdRef = await ensureConvexSessionId(orgId, sessionId);

  // If ensure failed, we can still run, but LIVE VIEW in dashboard won’t match.
  // Better to stop quietly to avoid inconsistent state.
  if (!convexSessionIdRef) {
    cleanup();
    return;
  }

  const convexSessionId = convexSessionIdRef;

  const pusher = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    forceTLS: true,
    enabledTransports: ["ws", "wss"],
    disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],
    channelAuthorization: {
      endpoint: PUSHER_AUTH_URL,
      transport: "ajax",
      // ✅ send orgId + convexSessionId to auth route (optional but useful)
      params: { orgId, sessionId: convexSessionId },
    } as any,
  });

  pusherRef = pusher;

  // ✅ IMPORTANT: channel uses CONVEX session id (matches dashboard)
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

    if (liveQueue.length > QUEUE_OVERFLOW_HARD_LIMIT) {
      overflowStrikes++;
      liveQueue = liveQueue.slice(-MAX_QUEUE_EVENTS);
      if (overflowStrikes >= MAX_OVERFLOW_STRIKES) cleanup();
      return;
    }

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
    // nav watcher -> request snapshot refresh (safe)
    uninstallNav = installNavigationWatcher(() => requestNavSnapshotSafely());

    stopRecording = record({
      sampling: {
        mousemove: 220,
        mouseInteraction: true,
        scroll: 260,
        input: "last",
      },
      emit(event: eventWithTime) {
        try {
          if (isHidden()) return;

          const isFullSnapshot = event.type === 2;

          // 1) first snapshot
          if (!snapshotSentOnce) {
            snapshotBuffer.push(event);
            if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER_EVENTS) {
              snapshotBuffer.splice(0, snapshotBuffer.length - MAX_SNAPSHOT_BUFFER_EVENTS);
            }

            if (isFullSnapshot) {
              snapshotSentOnce = true;

              const snapshotEvents = [...snapshotBuffer];
              snapshotBuffer = [];

              if (externalSessionIdRef) {
                void postSnapshot(orgId, externalSessionIdRef, snapshotEvents);
              }
              return; // never stream FullSnapshot
            }

            return;
          }

          // 2) nav refresh snapshot (without blocking live)
          if (wantNewSnapshot) {
            snapshotBuffer.push(event);
            if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER_EVENTS) {
              snapshotBuffer.splice(0, snapshotBuffer.length - MAX_SNAPSHOT_BUFFER_EVENTS);
            }

            if (isFullSnapshot) {
              wantNewSnapshot = false;

              const snapshotEvents = [...snapshotBuffer];
              snapshotBuffer = [];

              if (externalSessionIdRef) {
                void postSnapshot(orgId, externalSessionIdRef, snapshotEvents);
              }
              return; // never stream FullSnapshot
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
