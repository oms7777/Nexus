// apps/web/app/api/integrations/salesforce/start/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SF_CLIENT_ID = process.env.SALESFORCE_CLIENT_ID!;
const SF_LOGIN_URL = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
// pour sandbox -> https://test.salesforce.com

export async function GET(req: Request) {
  const authCtx = await auth();
  const { userId, orgId } = authCtx;

  if (!userId || !orgId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const origin = url.origin;

  const redirectUri = `${origin}/api/integrations/salesforce/callback`;

  // state Base64URL (comme Slack)
  const statePayload = {
    orgId,
    userId,
    redirect: "/integrations",
  };

  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  // Scopes Salesforce (minimum viable pour créer Lead/Event + refresh)
  const scope = [
    "api",
    "refresh_token",
    "offline_access",
    // optionnel :
    // "openid",
    // "id",
  ].join(" ");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SF_CLIENT_ID,
    redirect_uri: redirectUri,
    scope,
    state,
  });

  return NextResponse.redirect(
    `${SF_LOGIN_URL}/services/oauth2/authorize?${params.toString()}`
  );
}
