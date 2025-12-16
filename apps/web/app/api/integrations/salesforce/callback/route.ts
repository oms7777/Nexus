import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";

export const runtime = "nodejs";

const SF_CLIENT_ID = process.env.SALESFORCE_CLIENT_ID!;
const SF_CLIENT_SECRET = process.env.SALESFORCE_CLIENT_SECRET!;
const SF_LOGIN_URL =
  process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";

export async function GET(req: Request) {
  const authCtx = await auth();
  const { userId, orgId } = authCtx;

  if (!userId || !orgId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

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

  // decode state
  let parsedState: any = {};
  try {
    parsedState = JSON.parse(Buffer.from(stateParam, "base64url").toString("utf8"));
  } catch {
    return new NextResponse("Invalid state", { status: 400 });
  }

  const redirectPath = parsedState.redirect ?? "/integrations";
  const origin = url.origin;
  const redirectUri = `${origin}/api/integrations/salesforce/callback`;

  // récupérer PKCE verifier depuis cookie
    const cookieHeader = req.headers.get("cookie") ?? "";
    const verifierMatch = cookieHeader.match(/(?:^|;\s*)sf_pkce_verifier=([^;]+)/);

    const codeVerifierRaw = verifierMatch?.[1];
    if (!codeVerifierRaw) {
    return new NextResponse("Missing PKCE code_verifier cookie", { status: 400 });
    }

    const codeVerifier = decodeURIComponent(codeVerifierRaw);


    if (!codeVerifier) {
        return new NextResponse("Missing PKCE code_verifier cookie", { status: 400 });
    }

  // échange code -> tokens
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
    return new NextResponse(
      `Token exchange failed: ${JSON.stringify(tokenData)}`,
      { status: 500 }
    );
  }

  const accessToken = tokenData.access_token as string;
  const refreshToken = tokenData.refresh_token as string | undefined;
  const instanceUrl = tokenData.instance_url as string;

  // save in Convex
  const convexToken = await authCtx.getToken({ template: "convex" });

  await fetchMutation(
    api.integrations.saveSalesforceIntegration,
    {
      organizationId: orgId,
      accessToken,
      refreshToken,
      instanceUrl,
    },
    { token: convexToken ?? undefined }
  );

  const res = NextResponse.redirect(`${origin}${redirectPath}?salesforce_connected=1`);
  // cleanup cookie
  res.cookies.set("sf_pkce_verifier", "", { path: "/", maxAge: 0 });

  return res;
}
