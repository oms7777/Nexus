import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const origin = url.origin;
  const redirectUri = `${origin}/api/integrations/google/callback`; // <— must match Google console

  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "openid", "email", "profile",
    "https://www.googleapis.com/auth/gmail.send",
  ];

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",   // <—
    scope: scopes.join(" "),
    state: JSON.stringify({ orgId, userId, redirect: "/me/calendar" }),
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
