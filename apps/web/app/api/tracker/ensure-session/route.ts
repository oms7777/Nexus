import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";
import type { Id } from "@workspace/backend/_generated/dataModel";

export const runtime = "nodejs";

function makeCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "null";
  const reqHeaders =
    req.headers.get("access-control-request-headers") || "content-type";

  const h = new Headers();
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Access-Control-Allow-Credentials", "true");
  h.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", reqHeaders);
  h.set("Vary", "Origin, Access-Control-Request-Headers");
  return h;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: makeCorsHeaders(req) });
}

export async function POST(req: Request) {
  const headers = makeCorsHeaders(req);

  try {
    const body = await req.json();

    const organizationId = body?.organizationId as string | undefined;
    const sessionIdRaw = body?.sessionId as string | undefined; // optionnel
    const metadata = body?.metadata;

    if (!organizationId) {
      headers.set("Content-Type", "application/json");
      return NextResponse.json({ ok: false, error: "Missing organizationId" }, { status: 400, headers });
    }

    const sessionId = sessionIdRaw
      ? (sessionIdRaw as Id<"contactSessions">)
      : undefined;

    const id = await fetchMutation(api.public.contactSessions.ensure, {
      organizationId,
      sessionId, // undefined => create
      metadata,
    });

    headers.set("Content-Type", "application/json");
    return NextResponse.json({ ok: true, sessionId: id }, { status: 200, headers });
  } catch (err) {
    console.error("[ensure-session] POST error", err);
    headers.set("Content-Type", "application/json");
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500, headers });
  }
}
