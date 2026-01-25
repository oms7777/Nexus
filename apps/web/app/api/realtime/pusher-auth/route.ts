import { NextResponse } from "next/server";
import Pusher from "pusher";

export const runtime = "nodejs";

// ✅ Origins autorisées (prod + dev)
const ALLOWED_ORIGINS = new Set([
  "https://app.inboundless.co",
  "https://widget.inboundless.co",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null) {
  const allow =
    origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : process.env.NODE_ENV === "production"
        ? "https://app.inboundless.co"
        : "*";

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  } as Record<string, string>;
}

const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const CORS = corsHeaders(origin);

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

    const orgId: string | undefined = data.orgId;
    const sessionId: string | undefined = data.sessionId;

    if (
      typeof channelName !== "string" ||
      typeof socketId !== "string" ||
      !/^presence\-org_[\w-]+_session_[\w-]+$/.test(channelName)
    ) {
      return new NextResponse("Bad channel", { status: 400, headers: CORS });
    }

    const presenceData = {
      user_id: sessionId ?? "anon",
      user_info: { orgId, sessionId },
    };

    const auth = pusherServer.authorizeChannel(socketId, channelName, presenceData);

    return new NextResponse(JSON.stringify(auth), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err) {
    console.error("Pusher auth error:", err);
    return new NextResponse("Auth error", { status: 500, headers: CORS });
  }
}