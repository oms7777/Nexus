// apps/web/app/api/tracker/ensure-session/route.ts
import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";
import type { Id } from "@workspace/backend/_generated/dataModel";

export const runtime = "nodejs";

function makeCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Requested-With, Authorization",
    Vary: "Origin",
  } as Record<string, string>;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: makeCorsHeaders(req) });
}

export async function POST(req: Request) {
  const cors = makeCorsHeaders(req);

  try {
    const body = await req.json();

    const organizationId = body?.organizationId as string | undefined;
    const convexSessionId = body?.convexSessionId as Id<"contactSessions"> | undefined;
    const metadata = body?.metadata;

    if (!organizationId) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: "Missing organizationId" }),
        { status: 400, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    // ✅ If we already have a Convex Id, just touch it
    if (convexSessionId) {
      const id = await fetchMutation(api.public.contactSessions.ensure, {
        organizationId,
        sessionId: convexSessionId,
        metadata,
      });

      return new NextResponse(JSON.stringify({ ok: true, sessionId: id }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // ✅ Otherwise create an anonymous session
    const id = await fetchMutation(api.public.contactSessions.ensure, {
      organizationId,
      sessionId: undefined,
      metadata,
    });

    return new NextResponse(JSON.stringify({ ok: true, sessionId: id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors },
    });
  } catch (err) {
    console.error("[ensure-session] POST error", err);
    return new NextResponse(
      JSON.stringify({ ok: false, error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...cors } }
    );
  }
}
