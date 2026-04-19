/**
 * Stable public origin for OAuth redirect_uri on Vercel / proxies.
 * Prefer APP_ORIGIN or NEXT_PUBLIC_APP_URL so authorize + token exchange match HubSpot/Salesforce registration.
 */
export function getOAuthPublicOrigin(req: Request): string {
  const explicit =
    process.env.APP_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (explicit) {
    try {
      const raw = explicit.startsWith("http") ? explicit : `https://${explicit}`;
      return new URL(raw).origin;
    } catch {
      /* fall through */
    }
  }

  const xfProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const xfHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (xfProto && xfHost) {
    return `${xfProto}://${xfHost}`;
  }

  const host = req.headers.get("host");
  if (host) {
    const proto = xfProto || (process.env.VERCEL ? "https" : "http");
    return `${proto}://${host}`;
  }

  return new URL(req.url).origin;
}

/**
 * HubSpot OAuth authorize URL.
 * EU-hosted HubSpot accounts often require app-eu1.hubspot.com (see HubSpot developer community).
 *
 * Set HUBSPOT_OAUTH_AUTHORIZE_URL (full URL to …/oauth/authorize) or HUBSPOT_OAUTH_REGION=eu.
 */
export function getHubSpotAuthorizeUrl(): string {
  const full = process.env.HUBSPOT_OAUTH_AUTHORIZE_URL?.trim();
  if (full) {
    const trimmed = full.replace(/\/$/, "");
    if (trimmed.includes("/oauth/authorize")) return trimmed;
    return `${trimmed}/oauth/authorize`;
  }
  const region = process.env.HUBSPOT_OAUTH_REGION?.trim().toLowerCase();
  if (region === "eu" || region === "eu1") {
    return "https://app-eu1.hubspot.com/oauth/authorize";
  }
  return "https://app.hubspot.com/oauth/authorize";
}
