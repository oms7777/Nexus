// apps/web/app/api/integrations/slack/user/callback/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";

export const runtime = "nodejs";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET!;

if (!SLACK_CLIENT_ID) throw new Error("Missing SLACK_CLIENT_ID");
if (!SLACK_CLIENT_SECRET) throw new Error("Missing SLACK_CLIENT_SECRET");

function safeRedirectPath(input: any) {
  const p = typeof input === "string" ? input.trim() : "/me/profile";
  if (!p.startsWith("/")) return "/me/profile";
  return p || "/me/profile";
}

function decodeState(stateParam: string) {
  try {
    const json = Buffer.from(stateParam, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const authCtx = await auth();
  const { userId, orgId } = authCtx;

  if (!userId || !orgId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return new NextResponse(`Slack error: ${error}`, { status: 400 });
  if (!code || !stateParam) {
    return new NextResponse("Missing OAuth params", { status: 400 });
  }

  const state = decodeState(stateParam);
  if (!state) return new NextResponse("Invalid state", { status: 400 });
  if (!state.userConnect) return new NextResponse("Wrong Slack flow", { status: 400 });

  // ✅ Verify state matches current identity
  if (state.orgId !== orgId) return new NextResponse("Org mismatch", { status: 403 });
  if (state.userId !== userId) return new NextResponse("User mismatch", { status: 403 });

  const redirectPath = safeRedirectPath(state.redirect);
  const redirectUri = `${url.origin}/api/integrations/slack/user/callback`;

  // 1) Exchange code
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

  const data: any = await tokenRes.json().catch(() => ({}));
  if (!data?.ok) {
    return new NextResponse(`Slack OAuth error: ${data?.error || "unknown_error"}`, {
      status: 500,
    });
  }

  // OAuth v2: data.access_token = Bot token (xoxb-...)
  const accessToken = data.access_token as string | undefined;
  const slackUserId = data.authed_user?.id as string | undefined;

  if (!accessToken) return new NextResponse("Missing Slack bot access_token", { status: 500 });
  if (!slackUserId) return new NextResponse("Missing authed_user.id", { status: 500 });

  // 2) Open DM to get Dxxxx channel id
  const dmRes = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ users: slackUserId }),
  });

  const dmData: any = await dmRes.json().catch(() => ({}));
  if (!dmData?.ok) {
    return new NextResponse(`Slack DM error: ${dmData?.error || "unknown_error"}`, {
      status: 500,
    });
  }

  const slackDmChannel = dmData.channel?.id as string | undefined;
  if (!slackDmChannel) return new NextResponse("Missing DM channel id", { status: 500 });

  // 3) Save on rep (Convex)
  const convexToken = await authCtx.getToken({ template: "convex" });

  await fetchMutation(
    api.team.connectRepSlack,
    { userId, slackUserId, slackDmChannel },
    { token: convexToken ?? undefined }
  );

  // 4) Redirect back
  return NextResponse.redirect(
    `${url.origin}${redirectPath}?slack_user_connected=1`
  );
}
