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

let onMouseMoveRef: ((e: MouseEvent) => void) | null = null;

// ✅ IMPORTANT: now we always track with a REAL Convex Id
let convexSessionIdRef: string | null = null;

// snapshots
let snapshotSentOnce = false; // ✅ stays true after first successful snapshot
let snapshotBuffer: eventWithTime[] = [];

// ✅ navigation snapshot refresh (never blocks live)
let wantNewSnapshot = false;
let lastNavSnapshotRequestTs = 0;

// Live batching
let liveQueue: eventWithTime[] = [];
let flushing = false;

type VisitorTrackingOptions = {
  orgId: string;
  // ⚠️ external sessionId can exist but is not used for Convex anymore
  sessionId?: string;
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";
const ENSURE_SESSION_URL = "https://app.inboundless.co/api/tracker/ensure-session";

// ---------- SAFETY / PERF ----------
const MAX_EVENT_BYTES = 8_500;

// flush + cursor: less aggressive
const FLUSH_EVERY_MS = 450;
const CURSOR_THROTTLE_MS = 120;

// memory caps
const MAX_SNAPSHOT_BUFFER_EVENTS = 420;
const MAX_QUEUE_EVENTS = 260;

// snapshot rate limit
const SNAPSHOT_COOLDOWN_MS = 2500;
let lastSnapshotTs = 0;

// nav snapshot throttling
const NAV_SNAPSHOT_THROTTLE_MS = 5000;

// circuit breaker
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

  liveQueue = [];
  snapshotBuffer = [];
  flushing = false;

  snapshotSentOnce = false;
  wantNewSnapshot = false;

  lastSnapshotTs = 0;
  lastNavSnapshotRequestTs = 0;
  overflowStrikes = 0;

  convexSessionIdRef = null;

  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

/* ---------------- Convex ensure-session (CRITICAL) ---------------- */

function buildInitialMetadata() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      currentUrl: window.location.href,
      title: document.title,
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: Array.isArray(navigator.languages) ? navigator.languages.join(",") : undefined,
      platform: (navigator as any).platform,
      vendor: (navigator as any).vendor,
      screenResolution: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
      viewportSize: `${window.innerWidth ?? 0}x${window.innerHeight ?? 0}`,
      timezone: tz,
      timezoneOffset: new Date().getTimezoneOffset(),
      cookieEnabled: navigator.cookieEnabled,
      referrer: document.referrer || undefined,
    };
  } catch {
    return {
      currentUrl: typeof window !== "undefined" ? window.location.href : undefined,
      title: typeof document !== "undefined" ? document.title : undefined,
    };
  }
}

async function ensureConvexSessionId(orgId: string) {
  try {
    // reuse if already ensured
    if (convexSessionIdRef) return convexSessionIdRef;

    const res = await fetch(ENSURE_SESSION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: orgId,
        // server creates a session if convexSessionId is missing
        metadata: buildInitialMetadata(),
      }),
      keepalive: true,
      mode: "cors",
      credentials: "omit",
    });

    const json = await res.json().catch(() => ({} as any));
    const id = json?.sessionId;

    if (typeof id === "string" && id.length > 0) {
      convexSessionIdRef = id;
      return id;
    }

    return null;
  } catch {
    return null;
  }
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

async function postSnapshot(orgId: string, sessionId: string, events: eventWithTime[]) {
  if (!events.length) return;

  const now = Date.now();
  if (now - lastSnapshotTs < SNAPSHOT_COOLDOWN_MS) return;
  lastSnapshotTs = now;

  // ✅ trim: keep from first FullSnapshot + small tail
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
      body: JSON.stringify({ organizationId: orgId, sessionId, events }),
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

  // ✅ prepare a new snapshot without stopping live
  wantNewSnapshot = true;
  snapshotBuffer = [];

  // ✅ attempt a FullSnapshot, but only in idle to reduce freeze risk
  try {
    const take = (record as unknown as { takeFullSnapshot?: () => void }).takeFullSnapshot;

    if (typeof take === "function") {
      const run = () => {
        try {
          take();
        } catch {}
      };

      const ric = (window as any).requestIdleCallback as
        | ((cb: () => void, opts?: { timeout?: number }) => number)
        | undefined;

      if (typeof ric === "function") {
        ric(run, { timeout: 800 });
      } else {
        window.setTimeout(run, 120);
      }
    }
  } catch {}
}

/* ---------------- main init ---------------- */

export async function initVisitorTracking({ orgId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // never track inside widget iframe
  if (window.self !== window.top) return;

  started = true;
  purgePusherTransportCache();

  // ✅ CRITICAL: get a real Convex session id BEFORE pusher + snapshots
  const convexSessionId = await ensureConvexSessionId(orgId);
  if (!convexSessionId) {
    cleanup();
    return;
  }

  const pusher = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    forceTLS: true,
    enabledTransports: ["ws", "wss"],
    disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],
    channelAuthorization: {
      endpoint: PUSHER_AUTH_URL,
      transport: "ajax",
      // optional: pass ids so your auth route can set presence user_id
      params: { orgId, sessionId: convexSessionId },
    },
  });

  pusherRef = pusher;

  const channelName = `presence-org_${orgId}_session_${convexSessionId}`;
  const channel = pusher.subscribe(channelName) as Channel;
  channelRef = channel;

  // ---- live flush ----
  const flush = () => {
    if (!channelRef) return;
    if (!snapshotSentOnce) return; // only after first snapshot exists
    if (flushing) return;
    if (liveQueue.length === 0) return;
    if (isHidden()) return;

    // breaker
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

  // ---- cursor stream ----
  onMouseMoveRef = (e: MouseEvent) => triggerCursor(e);
  window.addEventListener("mousemove", onMouseMoveRef, { passive: true });

  channel.bind("pusher:subscription_succeeded", () => {
    // ✅ nav watcher: request "safe" snapshot (idle + throttled)
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

          // ---- 1) first snapshot ever ----
          if (!snapshotSentOnce) {
            snapshotBuffer.push(event);
            if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER_EVENTS) {
              snapshotBuffer.splice(0, snapshotBuffer.length - MAX_SNAPSHOT_BUFFER_EVENTS);
            }

            if (isFullSnapshot) {
              snapshotSentOnce = true;
              const snapshotEvents = [...snapshotBuffer];
              snapshotBuffer = [];
              void postSnapshot(orgId, convexSessionId, snapshotEvents);
              return; // never stream FullSnapshot
            }

            return; // no live until first snapshot posted
          }

          // ---- 2) nav snapshot refresh (does NOT block live) ----
          if (wantNewSnapshot) {
            snapshotBuffer.push(event);
            if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER_EVENTS) {
              snapshotBuffer.splice(0, snapshotBuffer.length - MAX_SNAPSHOT_BUFFER_EVENTS);
            }

            if (isFullSnapshot) {
              wantNewSnapshot = false;
              const snapshotEvents = [...snapshotBuffer];
              snapshotBuffer = [];
              void postSnapshot(orgId, convexSessionId, snapshotEvents);
              return; // never stream FullSnapshot
            }
            // keep streaming incrementals even while waiting
          }

          // ---- 3) normal live ----
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
