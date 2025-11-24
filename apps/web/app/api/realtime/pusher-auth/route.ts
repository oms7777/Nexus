import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

export const runtime = "nodejs";

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");

  try {
    const body = await req.json().catch(() => ({}));
    console.log("Pusher auth body:", body);

    const { channel_name, socket_id, orgId, sessionId } = body as {
      channel_name?: string;
      socket_id?: string;
      orgId?: string;
      sessionId?: string;
    };

    // 1) Vérifier les champs de base
    if (!channel_name || !socket_id) {
      return new NextResponse("Bad request", {
        status: 400,
        headers: corsHeaders(origin),
      });
    }

    // 2) Vérifier qu’on n’autorise que nos channels presence-org_x_session_y
    if (!/^presence-org_[\w-]+_session_[\w-]+$/.test(channel_name)) {
      return new NextResponse("Bad channel", {
        status: 403,
        headers: corsHeaders(origin),
      });
    }

    // 3) presenceData (orgId/sessionId facultatifs)
    const presenceData = {
      user_id: sessionId ?? socket_id,
      user_info: { orgId, sessionId },
    };

    const auth = pusherServer.authorizeChannel(
      socket_id,
      channel_name,
      presenceData,
    );

    return new NextResponse(JSON.stringify(auth), {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("Pusher auth error:", err);
    return new NextResponse("Internal error", {
      status: 500,
      headers: corsHeaders(origin),
    });
  }
}
