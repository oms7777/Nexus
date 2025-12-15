// apps/web/app/api/integrations/salesforce/callback/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";

export const runtime = "nodejs";

const SF_CLIENT_ID = process.env.SALESFORCE_CLIENT_ID!;
const SF_CLIENT_SECRET = process.env.SALESFORCE_CLIENT_SECRET!;
const SF_LOGIN_URL = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
// pour sandbox -> https://test.salesforce.com

export async function GET(req: Request) {
  const authCtx = await auth();
  const { userId, orgId } = authCtx;

  if (!userId || !orgId) {
    return new NextResponse("Unauthorized (missing Clerk user/org)", {
      status: 401,
    });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new NextResponse(`Salesforce OAuth error: ${error}`, { status: 400 });
  }

  if (!code || !stateParam) {
    return new NextResponse("Missing code or state", { status: 400 });
  }

  // decode state
  let parsedState: any = {};
  try {
    const decoded = Buffer.from(stateParam, "base64url").toString("utf8");
    parsedState = JSON.parse(decoded);
  } catch {
    return new NextResponse("Invalid state encoding", { status: 400 });
  }

  const redirectPath = parsedState.redirect ?? "/integrations";
  const origin = url.origin;
  const redirectUri = `${origin}/api/integrations/salesforce/callback`;

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
    }),
  });

  const data: any = await tokenRes.json();

  if (!tokenRes.ok || data.error) {
    return new NextResponse(
      `Salesforce token error: ${data.error ?? "unknown"} - ${data.error_description ?? ""}`,
      { status: 500 }
    );
  }

  const accessToken = data.access_token as string;
  const refreshToken = data.refresh_token as string | undefined;
  const instanceUrl = data.instance_url as string;

  if (!accessToken || !instanceUrl) {
    return new NextResponse("Salesforce OAuth: missing access_token/instance_url", {
      status: 500,
    });
  }

  const convexToken = await authCtx.getToken({ template: "convex" });

  // save en Convex
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

  return NextResponse.redirect(`${origin}${redirectPath}?salesforce_connected=1`);
}
