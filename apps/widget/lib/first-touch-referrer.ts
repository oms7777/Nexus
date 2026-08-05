/**
 * Persist the first *host* referrer seen in this tab so later SPA navigations
 * (same-site referrer or empty referrer) don't erase acquisition attribution.
 *
 * Prefer the referrer posted from the embed (`nexus:parent-location.referrer`);
 * fall back to the iframe's document.referrer only when nothing better exists.
 */
const STORAGE_KEY = "nx_first_touch_referrer_v1";

function readStored(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing && existing.trim().length > 0) return existing.trim();
  } catch {
    // private mode / blocked storage
  }
  return undefined;
}

function writeStored(value: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    // private mode / blocked storage
  }
}

/** Remember a candidate referrer if we don't already have a first-touch. */
export function rememberFirstTouchReferrer(candidate?: string | null): string | undefined {
  const existing = readStored();
  if (existing) return existing;

  const ref = typeof candidate === "string" ? candidate.trim() : "";
  if (!ref) return undefined;

  writeStored(ref);
  return ref;
}

export function getPersistedFirstTouchReferrer(): string | undefined {
  const existing = readStored();
  if (existing) return existing;

  // Last resort: iframe document.referrer (often the host page itself when embedded).
  const ref =
    typeof document !== "undefined" ? (document.referrer?.trim() ?? "") : "";
  if (ref) {
    writeStored(ref);
    return ref;
  }
  return undefined;
}
