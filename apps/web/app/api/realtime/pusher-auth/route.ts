import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

export const runtime = "nodejs";

// 🧩 Fabrique les bons headers CORS pour n'importe quelle origine
function makeCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";

  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
  headers.set("Vary", "Origin");

  return headers;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: makeCorsHeaders(req),
  });
}

export async function POST(req: Request) {
  const corsHeaders = makeCorsHeaders(req);

  try {
    const raw = await req.text();
    let data: any = {};

    // Pusher envoie du JSON ou du x-www-form-urlencoded
    try {
      data = JSON.parse(raw || "{}");
    } catch {
      const params = new URLSearchParams(raw);
      data = Object.fromEntries(params.entries());
    }

    const channelName: string = data.channel_name || data.channelName || "";
    const socketId: string = data.socket_id || data.socketId || "";

    const orgId: string | undefined = data.orgId;
    const sessionId: string | undefined = data.sessionId;

    // On limite aux channels presence-org_..._session_...
    if (
      typeof channelName !== "string" ||
      typeof socketId !== "string" ||
      !/^presence\-org_[\w-]+_session_[\w-]+$/.test(channelName)
    ) {
      return new NextResponse("Bad channel", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const presenceData = {
      user_id: sessionId ?? "anon",
      user_info: { orgId, sessionId },
    };

    const auth = pusherServer.authorizeChannel(
      socketId,
      channelName,
      presenceData,
    );

    corsHeaders.set("Content-Type", "application/json");

    return new NextResponse(JSON.stringify(auth), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("Pusher auth error:", err);
    return new NextResponse("Auth error", {
      status: 500,
      headers: corsHeaders,
    });
  }
}
