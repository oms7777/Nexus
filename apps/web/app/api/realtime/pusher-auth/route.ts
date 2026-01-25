// apps/web/app/api/realtime/pusher-auth/route.ts
import { NextResponse } from "next/server";
import Pusher from "pusher";


export const runtime = "nodejs";


// Allow both widget + app (prod), wildcard in dev
const ALLOWED_ORIGINS = new Set([
  "https://widget.inboundless.co",
  "https://app.inboundless.co",
]);


function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") ?? "";
  const allowOrigin =
    process.env.NODE_ENV !== "production"
      ? "*"
      : ALLOWED_ORIGINS.has(origin)
        ? origin
        : "https://app.inboundless.co"; // safe fallback


  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Credentials": "true",
    };
  }


const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});


export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}


export async function POST(req: Request) {
  const headers = corsHeaders(req);


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


// params envoyés par le client
const orgId: string | undefined = data.orgId;
const sessionId: string | undefined = data.sessionId;


if (
typeof channelName !== "string" ||
typeof socketId !== "string" ||
!/^presence\-org_[\w-]+_session_[\w-]+$/.test(channelName)
) {
return new NextResponse("Bad channel", { status: 400, headers });
}


// Extra safety: channel must match org/session provided
if (orgId && sessionId) {
const expected = `presence-org_${orgId}_session_${sessionId}`;
if (channelName !== expected) {
return new NextResponse("Forbidden", { status: 403, headers });
}
}


const presenceData = {
user_id: sessionId ?? "anon",
user_info: { orgId, sessionId },
};


const auth = pusherServer.authorizeChannel(socketId, channelName, presenceData);


return new NextResponse(JSON.stringify(auth), {
status: 200,
headers: { "Content-Type": "application/json", ...headers },
});
} catch (err) {
console.error("Pusher auth error:", err);
return new NextResponse("Auth error", { status: 500, headers });
}
}