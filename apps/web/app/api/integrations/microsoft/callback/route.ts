import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const authCtx = await auth();
  const { userId, orgId } = authCtx;
  if (!userId || !orgId) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return new NextResponse("Missing code", { status: 400 });

  const origin = url.origin;
  const redirectUri = `${origin}/api/integrations/microsoft/callback`;

  const scopes = ["offline_access", "openid", "profile", "email", "User.Read", "Calendars.ReadWrite"];

  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
  });

  const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const token: any = await r.json();
  if (!r.ok) return new NextResponse(`Token error: ${JSON.stringify(token)}`, { status: 500 });

  if (!token.refresh_token) {
    return new NextResponse("Missing refresh_token. Try again and ensure consent was granted.", {
      status: 400,
    });
  }

  // Optional: decode email from id_token
  let email = "";
  try {
    const idToken = typeof token.id_token === "string" ? token.id_token : "";
    if (idToken) {
      const parts = idToken.split(".");
      if (parts.length >= 2) {
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const json = Buffer.from(padded, "base64").toString("utf-8");
        const payload = JSON.parse(json);
        email = payload?.preferred_username ?? payload?.email ?? "";
      }
    }
  } catch {}

  const convexToken = await authCtx.getToken({ template: "convex" });

  await fetchMutation(
    api.private.calendar.saveMicrosoftAccount,
    {
      email,
      refreshToken: token.refresh_token as string,
      scope: token.scope as string | undefined,
    },
    { token: convexToken ?? undefined }
  );

  return NextResponse.redirect(`${origin}/me/calendar?connected=microsoft`);
}

