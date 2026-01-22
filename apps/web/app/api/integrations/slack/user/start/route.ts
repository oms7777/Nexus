// apps/web/app/api/integrations/slack/user/start/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
if (!SLACK_CLIENT_ID) throw new Error("Missing SLACK_CLIENT_ID");

// Slack OAuth v2 expects comma-separated scopes
const SLACK_SCOPE = "chat:write,im:write,users:read";

function safeRedirectPath(input: string | null) {
  const p = input?.trim() || "/me/profile";
  // prevent open redirects
  if (!p.startsWith("/")) return "/me/profile";
  return p;
}

export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const origin = url.origin;

  const redirectPath = safeRedirectPath(url.searchParams.get("redirect"));
  const redirectUri = `${origin}/api/integrations/slack/user/callback`;

  const statePayload = {
    orgId,
    userId,
    redirect: redirectPath,
    userConnect: true,
    ts: Date.now(),
  };

  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: SLACK_SCOPE,
    state,
  });

  return NextResponse.redirect(
    `https://slack.com/oauth/v2/authorize?${params.toString()}`
  );
}
