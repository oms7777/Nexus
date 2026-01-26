// apps/app/src/app/api/realtime/pusher-auth/route.ts
import { NextResponse } from "next/server";
import Pusher from "pusher";

export const runtime = "nodejs";

const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});

function makeCors(origin: string, req: Request) {
  const requestHeaders =
    req.headers.get("access-control-request-headers") ?? "content-type";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": requestHeaders,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin, Access-Control-Request-Headers",
  } as Record<string, string>;
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: 204, headers: makeCors(origin, req) });
}

function parseBody(raw: string) {
  // Pusher envoie généralement x-www-form-urlencoded :
  // socket_id=...&channel_name=...
  // Mais on supporte JSON aussi (au cas où).
  try {
    const j = JSON.parse(raw || "{}");
    if (j && typeof j === "object") return j;
  } catch {}
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return new NextResponse("Missing origin", { status: 400 });

  const CORS = makeCors(origin, req);

  try {
    const raw = await req.text();
    const data: any = parseBody(raw);

    const channelName = String(data.channel_name ?? data.channelName ?? "");
    const socketId = String(data.socket_id ?? data.socketId ?? "");

    if (!channelName || !socketId) {
      return new NextResponse("Bad request", { status: 400, headers: CORS });
    }

    // ✅ On attend EXACTEMENT : presence-org_<orgId>_session_<sessionId>
    const m = channelName.match(/^presence-org_([\w-]+)_session_([\w-]+)$/);
    if (!m) {
      return new NextResponse("Bad channel", { status: 400, headers: CORS });
    }

    // ✅ TS fix: m[1]/m[2] peuvent être vus comme string|undefined → on force non-null
    const orgId = m[1]!;
    const sessionId = m[2]!;

    // ✅ PresenceChannelData: user_id DOIT être string
    const presenceData = {
      user_id: sessionId,
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