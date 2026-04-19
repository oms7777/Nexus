import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";
import { requireOrgAdminOrResponse } from "../../_lib/requireOrgAdmin";

export const runtime = "nodejs";

/** Keep in sync with `packages/backend/convex/integrations.ts` and HubSpot app-hsmeta.json */
const HUBSPOT_OAUTH_SCOPES = ["oauth", "crm.objects.contacts.read", "crm.objects.contacts.write"].join(" ");

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

  if (!appConfig) {
    return new NextResponse("Missing HubSpot app config for this organization", {
      status: 400,
    });
  }

  const HS_CLIENT_ID = appConfig.clientId;

  const url = new URL(req.url);
  const origin = url.origin;
  const redirectUri = `${origin}/api/integrations/hubspot/callback`;

  const statePayload = { orgId, userId, redirect: "/integrations" };
  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  const params = new URLSearchParams({
    client_id: HS_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: HUBSPOT_OAUTH_SCOPES,
    state,
  });

  return NextResponse.redirect(`https://app.hubspot.com/oauth/authorize?${params.toString()}`);
}
