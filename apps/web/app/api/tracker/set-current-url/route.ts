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

    const sessionIdRaw = body?.sessionId as string | undefined;
    const url = body?.url as string | undefined;
    const title = body?.title as string | undefined;
    const referrer = body?.referrer as string | undefined;

    if (!sessionIdRaw || !url) {
      headers.set("Content-Type", "application/json");
      return new NextResponse(
        JSON.stringify({ ok: false, error: "Missing sessionId/url" }),
        { status: 400, headers }
      );
    }

    const sessionId = sessionIdRaw as Id<"contactSessions">;

    await fetchMutation(api.public.contactSessions.setCurrentUrl, {
      sessionId,
      url,
      title,
      referrer,
    });

    headers.set("Content-Type", "application/json");
    return new NextResponse(JSON.stringify({ ok: true }), {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error("[set-current-url] POST error", err);
    headers.set("Content-Type", "application/json");
    return new NextResponse(
      JSON.stringify({ ok: false, error: "Internal error" }),
      { status: 500, headers }
    );
  }
}
