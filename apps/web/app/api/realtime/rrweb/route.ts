// apps/web/app/api/realtime/rrweb/route.ts
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

type Body = {
  orgId?: string;
  sessionId?: string;
  action?: "start" | "stop";
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const orgId = typeof body.orgId === "string" ? body.orgId : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const action = body.action;

  if (!orgId || !sessionId || (action !== "start" && action !== "stop")) {
    return NextResponse.json(
      { ok: false, error: "Missing orgId/sessionId/action" },
      { status: 400 },
    );
  }

  const channel = `presence-org_${orgId}_session_${sessionId}`;
  const eventName = action === "start" ? "server-start-rrweb" : "server-stop-rrweb";

  try {
    await pusherServer.trigger(channel, eventName, { ts: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[rrweb route] trigger failed:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Trigger failed" },
      { status: 500 },
    );
  }
}