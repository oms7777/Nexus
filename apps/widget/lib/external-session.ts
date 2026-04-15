export const EXTERNAL_SESSION_ID_KEY = "nx_external_session_id";
export const VISITOR_ID_KEY = "nx_visitor_id";

function safeGetItem(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage errors (Safari private mode, blocked, etc.)
  }
}

function randomId(): string {
  try {
    // Prefer UUID when available.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Stable per-browser id used to de-duplicate sessions across refreshes.
 * This maps to Convex `contactSessions.externalSessionId` via `ensureByExternalId`.
 */
export function getOrCreateExternalSessionId(): string {
  const existing = safeGetItem(EXTERNAL_SESSION_ID_KEY);
  if (existing && existing.trim()) return existing;
  const id = randomId();
  safeSetItem(EXTERNAL_SESSION_ID_KEY, id);
  return id;
}

/**
 * Stable visitor id for analytics/metadata (not used as session key).
 * Kept for backward-compat with existing metadata pipelines.
 */
export function getOrCreateVisitorId(): string {
  const existing = safeGetItem(VISITOR_ID_KEY);
  if (existing && existing.trim()) return existing;
  const id = randomId();
  safeSetItem(VISITOR_ID_KEY, id);
  return id;
}

