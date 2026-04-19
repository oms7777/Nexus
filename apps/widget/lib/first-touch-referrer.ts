/**
 * Persist the first document.referrer seen in this tab so later SPA navigations
 * (same-site referrer or empty referrer) don't erase acquisition attribution.
 */
const STORAGE_KEY = "nx_first_touch_referrer_v1";

export function getPersistedFirstTouchReferrer(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing && existing.trim().length > 0) return existing.trim();

    const ref = typeof document !== "undefined" ? document.referrer?.trim() : "";
    if (ref && ref.length > 0) {
      sessionStorage.setItem(STORAGE_KEY, ref);
      return ref;
    }
  } catch {
    // private mode / blocked storage
  }
  return undefined;
}
