import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const origin = url.origin;
  const redirectUri = `${origin}/api/integrations/microsoft/callback`; // must match Azure app registration

  const scopes = ["offline_access", "openid", "profile", "email", "User.Read", "Calendars.ReadWrite"];

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: scopes.join(" "),
    prompt: "select_account",
    state: JSON.stringify({ orgId, userId, redirect: "/me/calendar" }),
  });

  return NextResponse.redirect(
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  );
}

