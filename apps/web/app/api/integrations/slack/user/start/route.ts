import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const SLACK_SCOPE = "chat:write im:write users:read";

export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const origin = url.origin;

  const redirectParam = url.searchParams.get("redirect") || "/me/profile";
  const redirectUri = `${origin}/api/integrations/slack/user/callback`;

  const statePayload = {
    orgId,
    userId,
    redirect: redirectParam,
    userConnect: true,
  };

  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: SLACK_SCOPE,
    state,
  });

  return NextResponse.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
}
