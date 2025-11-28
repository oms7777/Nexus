
// apps/web/app/api/realtime/pusher-auth/route.ts
// apps/web/app/api/realtime/pusher-auth/route.ts
import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

export const runtime = "nodejs";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",          // ✅ n'importe quel domaine
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
};

// OPTIONS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

// (facultatif) GET pour éviter le 405 sans CORS si tu ouvres l’URL dans le navigateur
export async function GET() {
  return new NextResponse("OK", {
    status: 200,
    headers: CORS_HEADERS,
  });
}

// Auth réel Pusher (POST ajax depuis le widget)
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    let data: any = {};

    // Pusher envoie du x-www-form-urlencoded par défaut
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
      !/^presence-org_[\w-]+_session_[\w-]+$/.test(channelName)
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
