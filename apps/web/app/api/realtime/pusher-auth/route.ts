// apps/web/app/api/realtime/pusher-auth/route.ts
import { NextResponse } from "next/server";
import Pusher from "pusher";

export const runtime = "nodejs";

/**
 * ✅ CORS
 * - Le tracker tourne sur les sites de tes clients (origin variable)
 * - Le dashboard tourne sur app.inboundless.co
 * - Le widget peut tourner sur widget.inboundless.co
 *
 * 👉 On whitelist tes origins connues + on "reflect" l'origin si tu veux accepter les domaines clients.
 * Si tu veux être STRICT, enlève le reflectOrigin et garde uniquement ALLOWED_ORIGINS.
 */
const ALLOWED_ORIGINS = new Set([
  "https://app.inboundless.co",
  "https://widget.inboundless.co",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null) {
  // ✅ 1) origin whitelist
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      // ⚠️ on n'a pas besoin de cookies ici, donc pas de credentials
      Vary: "Origin",
    } as Record<string, string>;
  }

  // ✅ 2) accept client origins (sites où le script est injecté)
  // -> indispensable si tu veux que le tracker fonctionne sur n'importe quel domaine client.
  // Si tu veux être strict, remplace par "https://app.inboundless.co" ou "*".
  if (origin && origin.startsWith("http")) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      Vary: "Origin",
    } as Record<string, string>;
  }

  // ✅ fallback
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
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

    // ✅ Ces params sont passés depuis:
    // - dashboard useVisitorStream: params { orgId, sessionId }
    // - embed visitor-tracker: params { orgId, sessionId: contactSessionId }
    const orgId: string | undefined = typeof data.orgId === "string" ? data.orgId : undefined;
    const sessionId: string | undefined =
      typeof data.sessionId === "string" ? data.sessionId : undefined;

    // sécurité: uniquement les channels presence-org_..._session_...
    if (
      typeof channelName !== "string" ||
      typeof socketId !== "string" ||
      !/^presence\-org_[\w-]+_session_[\w-]+$/.test(channelName)
    ) {
      return new NextResponse("Bad channel", { status: 400, headers: CORS });
    }

    // ✅ Optionnel mais utile: vérifier que les params matchent le channel
    // (empêche de signer un channel d'une autre org/session)
    const m = channelName.match(/^presence\-org_([\w-]+)_session_([\w-]+)$/);
    if (m) {
      const chOrg = m[1];
      const chSession = m[2];

      if (orgId && orgId !== chOrg) {
        return new NextResponse("Org mismatch", { status: 403, headers: CORS });
      }
      if (sessionId && sessionId !== chSession) {
        return new NextResponse("Session mismatch", { status: 403, headers: CORS });
      }
    }

    // présence (user_id stable)
    const presenceData = {
      user_id: sessionId ?? (m?.[2] ?? "anon"),
      user_info: { orgId: orgId ?? m?.[1], sessionId: sessionId ?? m?.[2] },
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