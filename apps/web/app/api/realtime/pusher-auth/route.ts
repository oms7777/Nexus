import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://widget.inboundless.co", // 👈 spécifique
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-Requested-With, X-CSRF-Token, Authorization, X-Socket-Id, X-Pusher-Channel-Name, X-Pusher-Key",
  "Access-Control-Allow-Credentials": "true",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { channel_name, socket_id, orgId, sessionId } = body || {};

  if (
    typeof channel_name !== "string" ||
    typeof socket_id !== "string" ||
    !/^presence\-org_[\w-]+_session_[\w-]+$/.test(channel_name)
  ) {
    return new NextResponse("Bad channel", { status: 400, headers: CORS_HEADERS });
  }

  const presenceData = {
    user_id: sessionId ?? "anon",
    user_info: { orgId, sessionId },
  };

  const auth = pusherServer.authorizeChannel(socket_id, channel_name, presenceData);

  return new NextResponse(JSON.stringify(auth), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}
