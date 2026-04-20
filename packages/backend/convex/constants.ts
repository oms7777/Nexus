/** Sliding expiry for `contactSessions` (ensure/validate). Was 48h; longer avoids early “session expired” during long visits. */
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
