import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";

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
    await fetchMutation(api.public.analytics.log, body);

    headers.set("Content-Type", "application/json");
    return new NextResponse(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (e) {
    headers.set("Content-Type", "application/json");
    return new NextResponse(JSON.stringify({ ok: false }), { status: 500, headers });
  }
}
