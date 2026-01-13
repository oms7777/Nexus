import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";

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
    await fetchMutation(api.public.analytics.log, body);

    headers.set("Content-Type", "application/json");
    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (err) {
    console.error("[log] error", err);
    headers.set("Content-Type", "application/json");
    return NextResponse.json({ ok: false }, { status: 500, headers });
  }
}
