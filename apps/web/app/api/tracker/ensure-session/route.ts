import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";
import type { Id } from "@workspace/backend/_generated/dataModel";

export const runtime = "nodejs";

function makeCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  const requestHeaders =
    req.headers.get("access-control-request-headers") ?? "content-type";

  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", requestHeaders);
  headers.set("Vary", "Origin, Access-Control-Request-Headers");
  return headers;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: makeCorsHeaders(req) });
}

export async function POST(req: Request) {
  const headers = makeCorsHeaders(req);

  try {
    const body = await req.json();

    const organizationId = body?.organizationId as string | undefined;
    const convexSessionId = body?.convexSessionId as
      | Id<"contactSessions">
      | undefined;
    const metadata = body?.metadata;

    if (!organizationId) {
      headers.set("Content-Type", "application/json");
      return new NextResponse(
        JSON.stringify({ ok: false, error: "Missing organizationId" }),
        { status: 400, headers }
      );
    }

    const sessionId = await fetchMutation(api.public.contactSessions.ensure, {
      organizationId,
      sessionId: convexSessionId, // undefined => create
      metadata,
    });

    headers.set("Content-Type", "application/json");
    return new NextResponse(JSON.stringify({ ok: true, sessionId }), {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error("[ensure-session] POST error", err);
    headers.set("Content-Type", "application/json");
    return new NextResponse(
      JSON.stringify({ ok: false, error: "Internal error" }),
      { status: 500, headers }
    );
  }
}
