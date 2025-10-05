// apps/web/app/api/integrations/google/callback/route.ts
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
  const redirectUri = `${origin}/api/integrations/google/callback`;

  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const token: any = await r.json();
  if (!r.ok) return new NextResponse(`Token error: ${JSON.stringify(token)}`, { status: 500 });

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
        email = payload?.email ?? "";
      }
    }
  } catch {}

  if (!token.refresh_token) {
    return new NextResponse(
      "Missing refresh_token (Google sometimes omits it if consent was already granted). Try again.",
      { status: 400 }
    );
  }

  // 👇 IMPORTANT: pass a Clerk token so Convex sees ctx.auth
  const convexToken = await authCtx.getToken({ template: "convex" });

  await fetchMutation(
    api.private.calendar.saveGoogleAccount,
    {
      email: email || "",
      refreshToken: token.refresh_token as string,
      scope: token.scope as string | undefined,
    },
    { token: convexToken ?? undefined }
  );

  return NextResponse.redirect(`${origin}/me/calendar?connected=google`);
}
