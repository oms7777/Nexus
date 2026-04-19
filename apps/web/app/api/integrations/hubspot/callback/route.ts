import { NextResponse } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";
import { mergeHubSpotOAuthCredentials } from "@workspace/backend/lib/inboundlessOauthEnv";
import { requireOrgAdminOrResponse } from "../../_lib/requireOrgAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await requireOrgAdminOrResponse();
  if (!guard.ok) return guard.response;
  const { authCtx, userId, orgId } = guard;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return new NextResponse(`HubSpot OAuth error: ${error} ${errorDescription ?? ""}`, {
      status: 400,
    });
  }

  if (!code || !stateParam) {
    return new NextResponse("Missing code or state", { status: 400 });
  }

  let parsedState: any = {};
  try {
    parsedState = JSON.parse(Buffer.from(stateParam, "base64url").toString("utf8"));
  } catch {
    return new NextResponse("Invalid state", { status: 400 });
  }

  if (parsedState?.orgId && parsedState.orgId !== orgId) {
    return new NextResponse("Invalid state (org mismatch)", { status: 400 });
  }
  if (parsedState?.userId && parsedState.userId !== userId) {
    return new NextResponse("Invalid state (user mismatch)", { status: 400 });
  }

  const redirectPath = parsedState.redirect ?? "/integrations";
  const origin = url.origin;
  const redirectUri = `${origin}/api/integrations/hubspot/callback`;

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
  const HS_CLIENT_SECRET = merged.clientSecret;

  const tokenRes = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: HS_CLIENT_ID,
      client_secret: HS_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
    }),
  });

  const tokenData: any = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok || !tokenData?.access_token) {
    return new NextResponse(`Token exchange failed: ${JSON.stringify(tokenData)}`, {
      status: 500,
    });
  }

  const accessToken = tokenData.access_token as string;
  const refreshToken = tokenData.refresh_token as string | undefined;

  let portalId: string | undefined;
  let hubDomain: string | undefined;
  try {
    const metaRes = await fetch(
      `https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const meta: any = await metaRes.json().catch(() => ({}));
    if (metaRes.ok && meta) {
      if (meta.hub_id !== undefined) portalId = String(meta.hub_id);
      if (meta.hub_domain) hubDomain = String(meta.hub_domain);
    }
  } catch {
    // optional metadata
  }

  await fetchMutation(
    api.integrations.saveHubSpotIntegration,
    {
      accessToken,
      refreshToken,
      portalId,
      hubDomain,
    },
    { token: convexToken ?? undefined }
  );

  return NextResponse.redirect(`${origin}${redirectPath}?hubspot_connected=1`);
}
