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

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return new NextResponse("Missing origin", { status: 400 });

  const CORS = makeCors(origin, req);

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

    if (!orgId) return new NextResponse("Missing orgId", { status: 400, headers: CORS });

    // ✅ validate channel format
    if (
      typeof channelName !== "string" ||
      typeof socketId !== "string" ||
      !/^presence\-org_[\w-]+_session_[\w-]+$/.test(channelName)
    ) {
      return new NextResponse("Bad channel", { status: 400, headers: CORS });
    }

    // ✅ safety: channel must match orgId
    if (!channelName.startsWith(`presence-org_${orgId}_session_`)) {
      return new NextResponse("Channel/org mismatch", { status: 403, headers: CORS });
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