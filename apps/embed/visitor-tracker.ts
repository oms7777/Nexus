// apps/embed/visitor-tracker.ts
"use client";

type VisitorTrackingOptions = {
  orgId: string;
  contactSessionId: string; // Convex Id<"contactSessions"> as string
};

// =======================
// Config
// =======================
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";
const SNAPSHOT_DEBOUNCE_MS = 400;
const MIN_SNAPSHOT_INTERVAL_MS = 1500;

// =======================
// State
// =======================
let started = false;

let lastHref: string | null = null;
let unpatchHistory: (() => void) | null = null;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSentAt = 0;

let abort: AbortController | null = null;

function now() {
  return Date.now();
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

async function sendSnapshot(payload: {
  organizationId: string;
  sessionId: string;
  pageUrl: string;
  title?: string;
  width?: number;
  height?: number;
}) {
  try {
    abort?.abort();
  } catch {}
  abort = new AbortController();

  try {
    await fetch(SNAPSHOT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // best-effort
  }
}

function scheduleSnapshot(opts: { orgId: string; sessionId: string }) {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    debounceTimer = null;

    const t = now();
    if (t - lastSentAt < MIN_SNAPSHOT_INTERVAL_MS) return;
    lastSentAt = t;

    const pageUrl = location.href;
    const title = document.title || undefined;

    sendSnapshot({
      organizationId: opts.orgId,
      sessionId: opts.sessionId,
      pageUrl,
      title,
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, SNAPSHOT_DEBOUNCE_MS);
}

function cleanup() {
  if (unpatchHistory) {
    try {
      unpatchHistory();
    } catch {}
  }
  unpatchHistory = null;

  if (debounceTimer) {
    try {
      clearTimeout(debounceTimer);
    } catch {}
  }
  debounceTimer = null;

  try {
    abort?.abort();
  } catch {}
  abort = null;

  lastHref = null;
  lastSentAt = 0;
  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

export function initVisitorTracking({ orgId, contactSessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // never track inside widget iframe
  if (window.self !== window.top) return;

  started = true;
  lastHref = location.href;

  // 1) send initial snapshot (page actuelle)
  scheduleSnapshot({ orgId, sessionId: contactSessionId });

  // 2) listen SPA navigations
  unpatchHistory = patchHistoryForUrlChanges(() => {
    const href = location.href;
    if (!href || href === lastHref) return;
    lastHref = href;

    scheduleSnapshot({ orgId, sessionId: contactSessionId });
  });

  // 3) also send on visibility/pagehide (best effort)
  const onPageHide = () => {
    try {
      const pageUrl = location.href;
      sendSnapshot({
        organizationId: orgId,
        sessionId: contactSessionId,
        pageUrl,
        title: document.title || undefined,
        width: window.innerWidth,
        height: window.innerHeight,
      });
    } catch {}
  };

  window.addEventListener("pagehide", onPageHide);

  // attach cleanup hook
  const originalDestroy = destroyVisitorTracking;
  (destroyVisitorTracking as any) = () => {
    try {
      window.removeEventListener("pagehide", onPageHide);
    } catch {}
    originalDestroy();
  };
}
