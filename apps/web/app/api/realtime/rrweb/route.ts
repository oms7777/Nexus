import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const orgId = String(body?.orgId || "");
    const sessionId = String(body?.sessionId || "");
    const action = String(body?.action || "");

    if (!orgId || !sessionId || (action !== "start" && action !== "stop")) {
      return new NextResponse("Bad request", { status: 400 });
    }

    const channelName = `presence-org_${orgId}_session_${sessionId}`;

    if (action === "start") {
      await pusherServer.trigger(channelName, "server-start-rrweb", { ts: Date.now() });
    } else {
      await pusherServer.trigger(channelName, "server-stop-rrweb", { ts: Date.now() });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[rrweb] route error:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
