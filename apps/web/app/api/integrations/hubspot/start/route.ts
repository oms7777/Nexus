import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";
import { mergeHubSpotOAuthCredentials } from "@workspace/backend/lib/inboundlessOauthEnv";
import { getHubSpotAuthorizeUrl, getOAuthPublicOrigin } from "../../_lib/oauthPublicOrigin";
import { requireOrgAdminOrResponse } from "../../_lib/requireOrgAdmin";

export const runtime = "nodejs";

/** Keep in sync with `packages/backend/convex/hubspot.ts` and HubSpot app-hsmeta.json */
const HUBSPOT_OAUTH_SCOPES = [
  "oauth",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  // Read-only, used by revenue attribution to read the deals a booking produced.
  "crm.objects.deals.read",
].join(" ");

export async function GET(req: Request) {
  const guard = await requireOrgAdminOrResponse();
  if (!guard.ok) return guard.response;
  const { authCtx, userId, orgId } = guard;

  const convexToken = await authCtx.getToken({ template: "convex" });

  const appConfig = await fetchQuery(
    api.integrations.getHubSpotAppConfig,
    {},
    { token: convexToken ?? undefined }
  );

  const merged = mergeHubSpotOAuthCredentials(appConfig);
  if (!merged) {
    return new NextResponse(
      "Missing HubSpot OAuth credentials: save app config in Integrations or set INBOUNDLESS_HUBSPOT_* env vars.",
      { status: 400 }
    );
  }

  const HS_CLIENT_ID = merged.clientId;

  const origin = getOAuthPublicOrigin(req);
  const redirectUri = `${origin}/api/integrations/hubspot/callback`;

  const statePayload = { orgId, userId, redirect: "/integrations" };
  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  const params = new URLSearchParams({
    client_id: HS_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: HUBSPOT_OAUTH_SCOPES,
    state,
  });

  const authorizeUrl = getHubSpotAuthorizeUrl();
  return NextResponse.redirect(`${authorizeUrl}?${params.toString()}`);
}
