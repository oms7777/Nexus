/**
 * Inside the widget iframe, `window.location` is the widget origin (widget.inboundless.co).
 * Prefer postMessage from the embed script (`nexus:parent-location`); these helpers are sync fallbacks.
 */

const HOSTED_HOSTS = new Set(["widget.inboundless.co", "app.inboundless.co"]);

export function isHostedInboundlessUrl(url?: string): boolean {
  if (!url) return false;
  try {
    return HOSTED_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Best-effort host page URL when embedded in iframe. Returns undefined if only the widget URL is known.
 */
export function getHostPageUrlSync(): string | undefined {
  if (typeof window === "undefined") return undefined;

  if (!isHostedInboundlessUrl(window.location.href)) {
    return window.location.href;
  }

  const ref = typeof document !== "undefined" ? document.referrer : "";
  if (ref && !isHostedInboundlessUrl(ref)) {
    try {
      const u = new URL(ref);
      if (u.protocol === "http:" || u.protocol === "https:") return ref;
    } catch {
      // ignore
    }
  }

  try {
    if (window.parent && window.parent !== window) {
      const href = window.parent.location.href;
      if (href && !isHostedInboundlessUrl(href)) return href;
    }
  } catch {
    // cross-origin parent
  }

  return undefined;
}
