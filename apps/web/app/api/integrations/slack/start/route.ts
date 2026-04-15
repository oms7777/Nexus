// apps/web/app/api/integrations/slack/start/route.ts
import { NextResponse } from "next/server";
import { requireOrgAdminOrResponse } from "../../_lib/requireOrgAdmin";

export const runtime = "nodejs";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const SLACK_SCOPE = "chat:write chat:write.public";

export async function GET(req: Request) {
  const guard = await requireOrgAdminOrResponse();
  if (!guard.ok) return guard.response;
  const { userId, orgId } = guard;

  const url = new URL(req.url);
  const origin = url.origin;

  const redirectUri = `${origin}/api/integrations/slack/callback`;

  // MUST be encoded in Base64URL to match callback decoding
  const statePayload = {
    orgId,
    userId,
    redirect: "/integrations",
  };

  const state = Buffer
    .from(JSON.stringify(statePayload))
    .toString("base64url");

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
