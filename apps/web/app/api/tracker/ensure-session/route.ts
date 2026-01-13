import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";
import type { Id } from "@workspace/backend/_generated/dataModel";

export const runtime = "nodejs";

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  const reqHeaders = req.headers.get("access-control-request-headers") ?? "content-type";

  const h = new Headers();
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Access-Control-Allow-Credentials", "true");
  h.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", reqHeaders);
  h.set("Vary", "Origin, Access-Control-Request-Headers");
  return h;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function POST(req: Request) {
  const headers = cors(req);

  try {
    const body = await req.json();

    const organizationId = body?.organizationId as string | undefined;
    const convexSessionId = body?.convexSessionId as Id<"contactSessions"> | undefined;
    const metadata = body?.metadata;

    if (!organizationId) {
      headers.set("Content-Type", "application/json");
      return new NextResponse(JSON.stringify({ ok: false, error: "Missing organizationId" }), {
        status: 400,
        headers,
      });
    }

    // reuse or create anonymous
    const id = await fetchMutation(api.public.contactSessions.ensure, {
      organizationId,
      sessionId: convexSessionId, // can be undefined -> create new
      metadata,
    });

    headers.set("Content-Type", "application/json");
    return new NextResponse(JSON.stringify({ ok: true, sessionId: id }), {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error("[ensure-session] POST error", err);
    headers.set("Content-Type", "application/json");
    return new NextResponse(JSON.stringify({ ok: false, error: "Internal error" }), {
      status: 500,
      headers,
    });
  }
}
