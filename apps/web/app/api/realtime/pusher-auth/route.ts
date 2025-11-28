
// apps/web/app/api/realtime/pusher-auth/route.ts
import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

export const runtime = "nodejs";

/*
  Helper CORS universel (widget embarqué sur n'importe quel domaine)
*/
function withCors(body: BodyInit | null, init: ResponseInit = {}, origin?: string | null) {
  const headers = new Headers(init.headers);

  headers.set("Access-Control-Allow-Origin", origin || "*");
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");

  return new NextResponse(body, { ...init, headers });
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return withCors(null, { status: 204 }, origin);
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");

  try {
    const raw = await req.text();
    let data: any = {};

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

    // Sécurité basique sur le pattern de channel
    if (
      typeof channelName !== "string" ||
      typeof socketId !== "string" ||
      !/^presence-org_[\w-]+_session_[\w-]+$/.test(channelName)
    ) {
      return withCors("Bad channel", { status: 400 }, origin);
    }

    const presenceData = {
      user_id: sessionId ?? "anon",
      user_info: { orgId, sessionId },
    };

    const auth = pusherServer.authorizeChannel(
      socketId,
      channelName,
      presenceData
    );

    return withCors(
      JSON.stringify(auth),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
      origin
    );
  } catch (err) {
    console.error("Pusher auth error:", err);
    return withCors("Auth error", { status: 500 }, origin);
  }
}
