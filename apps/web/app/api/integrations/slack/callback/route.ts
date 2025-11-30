// apps/web/app/api/integrations/slack/callback/route.ts
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

  if (!userId || !orgId) {
    return new NextResponse("Unauthorized (missing Clerk user/org)", {
      status: 401,
    });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new NextResponse(`Slack OAuth error: ${error}`, { status: 400 });
  }

  if (!code || !stateParam) {
    return new NextResponse("Missing code or state", { status: 400 });
  }

  let parsedState: any = {};
  try {
    const decoded = Buffer.from(stateParam, "base64url").toString("utf8");
    parsedState = JSON.parse(decoded);
  } catch {
    return new NextResponse("Invalid state encoding", { status: 400 });
  }

  const redirectPath = parsedState.redirect ?? "/integrations";
  const origin = url.origin;
  const redirectUri = `${origin}/api/integrations/slack/callback`;

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

  if (!data.ok) {
    return new NextResponse(
      `Slack OAuth error: ${data.error ?? "unknown"}`,
      { status: 500 }
    );
  }

  const accessToken = data.access_token as string;
  const teamId = data.team?.id ?? "";
  const teamName = data.team?.name ?? "";

  const convexToken = await authCtx.getToken({ template: "convex" });

  await fetchMutation(
    api.integrations.saveSlackIntegration,
    {
      organizationId: orgId,
      accessToken,
      teamId,
      teamName,
      defaultChannel: "#general",
    },
    { token: convexToken ?? undefined }
  );

  return NextResponse.redirect(
    `${origin}${redirectPath}?slack_connected=1`
  );
}
