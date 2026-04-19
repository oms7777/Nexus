import { NextResponse } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";
import { mergeSalesforceOAuthCredentials } from "@workspace/backend/lib/inboundlessOauthEnv";
import { getOAuthPublicOrigin } from "../../_lib/oauthPublicOrigin";
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
    return new NextResponse(
      `Salesforce OAuth error: ${error} ${errorDescription ?? ""}`,
      { status: 400 }
    );
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

  // Prevent cross-org/cross-user state reuse.
  if (parsedState?.orgId && parsedState.orgId !== orgId) {
    return new NextResponse("Invalid state (org mismatch)", { status: 400 });
  }
  if (parsedState?.userId && parsedState.userId !== userId) {
    return new NextResponse("Invalid state (user mismatch)", { status: 400 });
  }

  const redirectPath = parsedState.redirect ?? "/integrations";
  const origin = getOAuthPublicOrigin(req);
  const redirectUri = `${origin}/api/integrations/salesforce/callback`;

  // cookie PKCE
  const cookieHeader = req.headers.get("cookie") ?? "";
  const verifierMatch = cookieHeader.match(/(?:^|;\s*)sf_pkce_verifier=([^;]+)/);
  const codeVerifierRaw = verifierMatch?.[1];

  if (!codeVerifierRaw) {
    return new NextResponse("Missing PKCE code_verifier cookie", { status: 400 });
  }

  const codeVerifier = decodeURIComponent(codeVerifierRaw);

  // load app config
  const convexToken = await authCtx.getToken({ template: "convex" });

  const appConfig = await fetchQuery(
    api.integrations.getSalesforceAppConfig,
    {},
    { token: convexToken ?? undefined }
  );

  const merged = mergeSalesforceOAuthCredentials(appConfig);
  if (!merged) {
    return new NextResponse(
      "Missing Salesforce OAuth credentials: save app config in Integrations or set INBOUNDLESS_SALESFORCE_* env vars.",
      { status: 400 }
    );
  }

  const SF_CLIENT_ID = merged.clientId;
  const SF_CLIENT_SECRET = merged.clientSecret;
  const SF_LOGIN_URL = merged.loginUrl;

  // token exchange
  const tokenRes = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: SF_CLIENT_ID,
      client_secret: SF_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier,
    }),
  });

  const tokenData: any = await tokenRes.json();

  if (!tokenRes.ok) {
    return new NextResponse(`Token exchange failed: ${JSON.stringify(tokenData)}`, {
      status: 500,
    });
  }

  const accessToken = tokenData.access_token as string;
  const refreshToken = tokenData.refresh_token as string | undefined;
  const instanceUrl = tokenData.instance_url as string;

  await fetchMutation(
    api.integrations.saveSalesforceIntegration,
    {
      accessToken,
      refreshToken,
      instanceUrl,
    },
    { token: convexToken ?? undefined }
  );

  const res = NextResponse.redirect(
    `${origin}${redirectPath}?salesforce_connected=1`
  );

  res.cookies.set("sf_pkce_verifier", "", { path: "/", maxAge: 0 });

  return res;
}
