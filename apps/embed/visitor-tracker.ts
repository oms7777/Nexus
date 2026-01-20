// apps/embed/visitor-tracker.ts
"use client";

type VisitorTrackingOptions = {
  orgId: string;
  contactSessionId: string; // Convex Id<"contactSessions"> as string
};

const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// debounce URL changes
const DEBOUNCE_MS = 200;
// safety spam guard
const MIN_INTERVAL_MS = 800;

let started = false;
let lastHref: string | null = null;
let unpatchHistory: (() => void) | null = null;

let timer: ReturnType<typeof setTimeout> | null = null;
let lastSentAt = 0;
let abort: AbortController | null = null;

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

async function postSnapshot(payload: {
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
    // best effort
  }
}

function scheduleSend(opts: { orgId: string; sessionId: string }) {
  if (timer) clearTimeout(timer);

  timer = setTimeout(() => {
    timer = null;

    const t = Date.now();
    if (t - lastSentAt < MIN_INTERVAL_MS) return;
    lastSentAt = t;

    const pageUrl = location.href;
    const title = document.title || undefined;

    postSnapshot({
      organizationId: opts.orgId,
      sessionId: opts.sessionId,
      pageUrl,
      title,
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, DEBOUNCE_MS);
}

function cleanup() {
  if (unpatchHistory) {
    try {
      unpatchHistory();
    } catch {}
  }
  unpatchHistory = null;

  if (timer) {
    try {
      clearTimeout(timer);
    } catch {}
  }
  timer = null;

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
  if (window.self !== window.top) return; // never track inside widget iframe

  started = true;
  lastHref = location.href;

  // initial send
  scheduleSend({ orgId, sessionId: contactSessionId });

  // SPA nav
  unpatchHistory = patchHistoryForUrlChanges(() => {
    const href = location.href;
    if (!href || href === lastHref) return;
    lastHref = href;

    scheduleSend({ orgId, sessionId: contactSessionId });
  });

  // pagehide best effort
  const onPageHide = () => {
    try {
      postSnapshot({
        organizationId: orgId,
        sessionId: contactSessionId,
        pageUrl: location.href,
        title: document.title || undefined,
        width: window.innerWidth,
        height: window.innerHeight,
      });
    } catch {}
  };

  window.addEventListener("pagehide", onPageHide);

  const originalDestroy = destroyVisitorTracking;
  (destroyVisitorTracking as any) = () => {
    try {
      window.removeEventListener("pagehide", onPageHide);
    } catch {}
    originalDestroy();
  };
}
