import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

export const runtime = "nodejs";

function makeCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "null";
  const reqHeaders =
    req.headers.get("access-control-request-headers") || "content-type,authorization,x-requested-with";

  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", reqHeaders);
  headers.set("Vary", "Origin, Access-Control-Request-Headers");
  return headers;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: makeCorsHeaders(req) });
}

export async function POST(req: Request) {
  const corsHeaders = makeCorsHeaders(req);

  try {
    const raw = await req.text();
    let data: Record<string, any> = {};

    try {
      data = JSON.parse(raw || "{}");
    } catch {
      const params = new URLSearchParams(raw);
      data = Object.fromEntries(params.entries());
    }

    const socketId = String(data.socket_id || "");
    const channelName = String(data.channel_name || "");

    if (
      !socketId ||
      !channelName ||
      !/^presence-org_[\w-]+_session_[\w-]+$/.test(channelName)
    ) {
      return new NextResponse("Bad channel", { status: 400, headers: corsHeaders });
    }

    const presenceData = { user_id: "anon", user_info: {} };
    const auth = pusherServer.authorizeChannel(socketId, channelName, presenceData);

    corsHeaders.set("Content-Type", "application/json");
    return new NextResponse(JSON.stringify(auth), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("[pusher-auth] error:", err);
    return new NextResponse("Auth error", { status: 500, headers: corsHeaders });
  }
}
