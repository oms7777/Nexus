import * as ct from "countries-and-timezones";

function normalizeGeoCountryCode(raw?: string | null): string | undefined {
  const s = (raw ?? "").trim().toUpperCase();
  if (s.length !== 2 || !/^[A-Z]{2}$/.test(s)) return undefined;
  return s;
}

export function getCountryFromTimezone(
  timezone?: string,
): { code: string; name: string } | null {
  if (!timezone) {
    return null;
  }

  const timezoneInfo = ct.getTimezone(timezone);
  const countryCode = timezoneInfo?.countries?.[0];
  if (!countryCode) {
    return null;
  }

  const country = ct.getCountry(countryCode);
  return {
    code: String(countryCode),
    name: country?.name || String(countryCode),
  };
}

/**
 * Prefer IP-based `countryCode` from session metadata (heartbeat / ipdata).
 * Many timezones map to several countries (or your OS may use Europe/Paris while you are in MA),
 * so timezone alone is a weak signal for flags.
 */
export function resolveVisitorCountry(metadata?: {
  countryCode?: string | null;
  timezone?: string | null;
} | null): { code: string; name: string } | null {
  const fromGeo = normalizeGeoCountryCode(metadata?.countryCode ?? undefined);
  if (fromGeo) {
    const country = ct.getCountry(fromGeo);
    return { code: fromGeo, name: country?.name || fromGeo };
  }
  return getCountryFromTimezone(metadata?.timezone ?? undefined);
}

export function getCountryFlagUrl(countryCode: string) {
    return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`;
}