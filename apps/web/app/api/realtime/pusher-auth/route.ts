import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { channel_name, socket_id, orgId, sessionId } = body || {};

  // Sécurité minimale : n’autorise que nos patterns
  if (
    typeof channel_name !== "string" ||
    typeof socket_id !== "string" ||
    !/^presence\-org_[\w-]+_session_[\w-]+$/.test(channel_name)
  ) {
    return new NextResponse("Bad channel", { status: 400 });
  }

  const presenceData = {
    user_id: sessionId ?? "anon",
    user_info: { orgId, sessionId },
  };

  const auth = pusherServer.authorizeChannel(socket_id, channel_name, presenceData);
  return new NextResponse(JSON.stringify(auth), {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
