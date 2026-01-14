import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

export const runtime = "nodejs";

function makeCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";

  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Requested-With, Authorization");
  headers.set("Vary", "Origin");
  return headers;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: makeCorsHeaders(req) });
}

export async function POST(req: Request) {
  const headers = makeCorsHeaders(req);

  try {
    const raw = await req.text();
    let data: Record<string, any> = {};

    // Pusher envoie souvent x-www-form-urlencoded
    try {
      data = JSON.parse(raw || "{}");
    } catch {
      const params = new URLSearchParams(raw);
      data = Object.fromEntries(params.entries());
    }

    const socketId = String(data.socket_id || "");
    const channelName = String(data.channel_name || "");

    if (!socketId || !channelName || !/^presence-org_[\w-]+_session_[\w-]+$/.test(channelName)) {
      return new NextResponse("Bad channel", { status: 400, headers });
    }

    const presenceData = { user_id: `anon_${socketId}`, user_info: {} };
    const auth = pusherServer.authorizeChannel(socketId, channelName, presenceData);

    headers.set("Content-Type", "application/json");
    return new NextResponse(JSON.stringify(auth), { status: 200, headers });
  } catch (err) {
    console.error("[pusher-auth] error:", err);
    return new NextResponse("Auth error", { status: 500, headers });
  }
}
