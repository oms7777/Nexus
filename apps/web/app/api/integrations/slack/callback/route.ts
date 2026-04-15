// apps/web/app/api/integrations/slack/callback/route.ts
import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";
import { requireOrgAdminOrResponse } from "../../_lib/requireOrgAdmin";

export const runtime = "nodejs";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET!;

export async function GET(req: Request) {
  const guard = await requireOrgAdminOrResponse();
  if (!guard.ok) return guard.response;
  const { authCtx, userId, orgId } = guard;

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

  // Decode du state (Base64URL -> JSON)
  let parsedState: any = {};
  try {
    const decoded = Buffer.from(stateParam, "base64url").toString("utf8");
    parsedState = JSON.parse(decoded);
  } catch {
    return new NextResponse("Invalid state encoding", { status: 400 });
  }

  // Prevent cross-org/cross-user state reuse.
  if (parsedState?.orgId && parsedState.orgId !== orgId) {
    return new NextResponse("Invalid state (org mismatch)", { status: 400 });
  }
  if (parsedState?.userId && parsedState.userId !== userId) {
    return new NextResponse("Invalid state (user mismatch)", { status: 400 });
  }

  const redirectPath = parsedState.redirect ?? "/integrations";
  const origin = url.origin;
  const redirectUri = `${origin}/api/integrations/slack/callback`;

  // Échange code -> access_token Slack
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

  // Token Convex (auth côté backend)
  const convexToken = await authCtx.getToken({ template: "convex" });

  // Sauvegarde de l’intégration dans Convex (mutation publique)
  await fetchMutation(
    api.integrations.saveSlackIntegration,
    {
      accessToken,
      teamId,
      teamName,
      defaultChannel: "#general",
    },
    { token: convexToken ?? undefined }
  );

  // Redirection vers l’UI
  return NextResponse.redirect(`${origin}${redirectPath}?slack_connected=1`);
}
