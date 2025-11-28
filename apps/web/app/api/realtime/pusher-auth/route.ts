// apps/web/app/api/realtime/pusher-auth/route.ts
import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

export const runtime = "nodejs";

// CORS global (multi-tenant)
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // ✅ tous les sites clients
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(req: Request) {
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

    // On ne signe que nos channels de tracking
    if (
      typeof channelName !== "string" ||
      typeof socketId !== "string" ||
      !/^presence\-org_[\w-]+_session_[\w-]+$/.test(channelName)
    ) {
      return new NextResponse("Bad channel", {
        status: 400,
        headers: CORS_HEADERS,
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

    return new NextResponse(JSON.stringify(auth), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    console.error("Pusher auth error:", err);
    return new NextResponse("Auth error", {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}
