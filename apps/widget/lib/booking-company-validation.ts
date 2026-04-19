/** Shared client-side rules — keep in sync with `isGarbageCompanyRow` in Signals (analytics UI). */

const BLOCK = new Set([
  "test",
  "none",
  "n/a",
  "na",
  "null",
  "unknown",
  "asdf",
  "qwerty",
  "qqq",
  "xxx",
  "hhh",
  "daf",
  "ads",
  "sqd",
  "dkf",
  "sd",
  "lol",
  "foo",
  "bar",
  "abc",
  "xyz",
]);

export function isPlausibleBookingCompany(raw: string | undefined): boolean {
  const s = (raw ?? "").trim().toLowerCase();
  if (s.length === 0) return true;
  if (s.length < 3 || s.length > 120) return false;
  if (/^(.)\1{2,}$/.test(s)) return false;
  if (BLOCK.has(s)) return false;
  return true;
}

export function bookingCompanyValidationMessage(raw: string | undefined): string | null {
  if (isPlausibleBookingCompany(raw)) return null;
  const s = (raw ?? "").trim();
  if (s.length > 0 && s.length < 3) return "Company must be at least 3 characters (or leave blank).";
  if (s.length > 120) return "Company name is too long.";
  return "Please enter a real company name (test words like “abc” are not accepted).";
}
