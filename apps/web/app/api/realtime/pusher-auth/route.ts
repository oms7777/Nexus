// apps/web/app/api/realtime/pusher-auth/route.ts
import { NextResponse } from "next/server";
import Pusher from "pusher";

export const runtime = "nodejs";

// CORS: le widget est sur widget.inboundless.co, ton app sur app.inboundless.co
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":
    process.env.NODE_ENV === "production" ? "https://widget.inboundless.co" : "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  try {
    // Pusher envoie souvent x-www-form-urlencoded
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

    // ✅ IMPORTANT: on récupère orgId/sessionId envoyés en params par le client
    const orgId: string | undefined = data.orgId;
    const sessionId: string | undefined = data.sessionId;

    // sécurité: uniquement les channels presence-org_..._session_...
    if (
      typeof channelName !== "string" ||
      typeof socketId !== "string" ||
      !/^presence\-org_[\w-]+_session_[\w-]+$/.test(channelName)
    ) {
      return new NextResponse("Bad channel", { status: 400, headers: CORS_HEADERS });
    }

    // présence (user_id doit être stable)
    const presenceData = {
      user_id: sessionId ?? "anon",
      user_info: { orgId, sessionId },
    };

    const auth = pusherServer.authorizeChannel(socketId, channelName, presenceData);

    return new NextResponse(JSON.stringify(auth), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    console.error("Pusher auth error:", err);
    return new NextResponse("Auth error", { status: 500, headers: CORS_HEADERS });
  }
}