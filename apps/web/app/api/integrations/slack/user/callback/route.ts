// apps/web/app/api/slack/user/callback/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";

export const runtime = "nodejs";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET!;

export async function GET(req: Request) {
  const authCtx = await auth();
  const { userId, orgId } = authCtx;

  if (!userId || !orgId)
    return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error)
    return new NextResponse(`Slack error: ${error}`, { status: 400 });

  if (!code || !stateParam)
    return new NextResponse("Missing OAuth params", { status: 400 });

  // decode state
  let state: any = {};
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString("utf8"));
  } catch {
    return new NextResponse("Invalid state", { status: 400 });
  }

  if (!state.userConnect)
    return new NextResponse("Wrong Slack flow", { status: 400 });

  const redirectPath = state.redirect ?? "/me/profile";
  const redirectUri = `${url.origin}/api/integrations/slack/user/callback`;

  // exchange code -> tokens
  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
    }),
  });

  const data: any = await tokenRes.json();
  if (!data.ok)
    return new NextResponse(`Slack OAuth error: ${data.error}`, { status: 500 });

  const accessToken = data.access_token as string;
  const slackUserId = data.authed_user?.id;

  if (!slackUserId)
    return new NextResponse("Missing slackUserId", { status: 500 });

  // Ouvre un DM entre l'app et ce user
  const dmRes = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ users: slackUserId }),
  });

  const dmData: any = await dmRes.json();
  if (!dmData.ok)
    return new NextResponse(`Slack DM error: ${dmData.error}`, { status: 500 });

  const slackDmChannel = dmData.channel?.id as string;

  // Save to Convex (NE MODIFIE QUE LES CHAMPS SLACK)
  const convexToken = await authCtx.getToken({ template: "convex" });

  await fetchMutation(
    api.team.connectRepSlack,
    {
      userId,
      slackUserId,
      slackDmChannel,
    },
    { token: convexToken ?? undefined }
  );

  return NextResponse.redirect(
    `${url.origin}${redirectPath}?slack_user_connected=1`
  );
}
