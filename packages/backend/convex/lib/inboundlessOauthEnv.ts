/**
 * Optional global OAuth credentials (Inboundless single app).
 * Set the same variable names in Vercel (Next.js routes) and Convex Dashboard (actions / refresh).
 *
 * Per-field merge: Convex row wins when that field is non-empty; otherwise env.
 */

export type MergedSalesforceOAuth = {
  clientId: string;
  clientSecret: string;
  loginUrl: string;
};

export type MergedHubSpotOAuth = {
  clientId: string;
  clientSecret: string;
};

export function mergeSalesforceOAuthCredentials(
  db: { clientId?: string; clientSecret?: string; loginUrl?: string } | null | undefined,
): MergedSalesforceOAuth | null {
  const clientId =
    db?.clientId?.trim() || process.env.INBOUNDLESS_SALESFORCE_CLIENT_ID?.trim() || "";
  const clientSecret =
    db?.clientSecret?.trim() || process.env.INBOUNDLESS_SALESFORCE_CLIENT_SECRET?.trim() || "";
  const loginUrl =
    db?.loginUrl?.trim() ||
    process.env.INBOUNDLESS_SALESFORCE_LOGIN_URL?.trim() ||
    "https://login.salesforce.com";

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, loginUrl };
}

export function mergeHubSpotOAuthCredentials(
  db: { clientId?: string; clientSecret?: string } | null | undefined,
): MergedHubSpotOAuth | null {
  const clientId =
    db?.clientId?.trim() || process.env.INBOUNDLESS_HUBSPOT_CLIENT_ID?.trim() || "";
  const clientSecret =
    db?.clientSecret?.trim() || process.env.INBOUNDLESS_HUBSPOT_CLIENT_SECRET?.trim() || "";

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function hasInboundlessSalesforceEnvDefaults(): boolean {
  return !!(
    process.env.INBOUNDLESS_SALESFORCE_CLIENT_ID?.trim() &&
    process.env.INBOUNDLESS_SALESFORCE_CLIENT_SECRET?.trim()
  );
}

export function hasInboundlessHubSpotEnvDefaults(): boolean {
  return !!(
    process.env.INBOUNDLESS_HUBSPOT_CLIENT_ID?.trim() &&
    process.env.INBOUNDLESS_HUBSPOT_CLIENT_SECRET?.trim()
  );
}
