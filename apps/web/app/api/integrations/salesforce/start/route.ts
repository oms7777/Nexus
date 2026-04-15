import { NextResponse } from "next/server";
import crypto from "crypto";
import { fetchQuery } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";
import { requireOrgAdminOrResponse } from "../../_lib/requireOrgAdmin";

export const runtime = "nodejs";

function base64url(input: Buffer) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sha256(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest();
}

export async function GET(req: Request) {
  const guard = await requireOrgAdminOrResponse();
  if (!guard.ok) return guard.response;
  const { authCtx, userId, orgId } = guard;

  const convexToken = await authCtx.getToken({ template: "convex" });

  const appConfig = await fetchQuery(
    api.integrations.getSalesforceAppConfig,
    {},
    { token: convexToken ?? undefined }
  );

  if (!appConfig) {
    return new NextResponse("Missing Salesforce app config for this organization", {
      status: 400,
    });
  }

  const SF_CLIENT_ID = appConfig.clientId;
  const SF_LOGIN_URL = appConfig.loginUrl || "https://login.salesforce.com";

  const url = new URL(req.url);
  const origin = url.origin;
  const redirectUri = `${origin}/api/integrations/salesforce/callback`;

  // PKCE
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(sha256(codeVerifier));

  // state Base64URL
  const statePayload = { orgId, userId, redirect: "/integrations" };
  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  const scope = ["api", "refresh_token", "openid", "profile", "email"].join(" ");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SF_CLIENT_ID,
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const res = NextResponse.redirect(
    `${SF_LOGIN_URL}/services/oauth2/authorize?${params.toString()}`
  );

  res.cookies.set("sf_pkce_verifier", codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  return res;
}
