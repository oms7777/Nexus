export function normalizeHostname(input: string): string | null {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return null;

  // Accept either a raw hostname ("whoz.com") or a URL ("https://whoz.com/x").
  const tryUrl = (raw: string) => {
    try {
      const u = new URL(raw);
      return u.hostname;
    } catch {
      return null;
    }
  };

  const fromUrl = tryUrl(s);
  const host = fromUrl ?? s;

  // Strip protocol leftovers if user pasted without URL constructor parsing.
  const cleaned = host.replace(/^https?:\/\//, "").split("/")[0]?.trim() ?? "";
  if (!cleaned) return null;
  if (cleaned.includes(" ") || cleaned.includes("@")) return null;

  // Normalize www.
  return cleaned.startsWith("www.") ? cleaned.slice(4) : cleaned;
}

export function isHostnameAllowed(allowedNormalized: string, incomingHostname: string): boolean {
  const a = normalizeHostname(allowedNormalized);
  const h = normalizeHostname(incomingHostname);
  if (!a || !h) return false;
  if (h === a) return true;
  // Also accept "www." variant implicitly.
  if (incomingHostname.toLowerCase().startsWith("www.") && h === a) return true;
  return false;
}

