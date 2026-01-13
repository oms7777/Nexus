// apps/web/app/api/tracker/set-current-url/route.ts
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
    const sessionIdRaw = body?.sessionId as string | undefined;
    const url = body?.url as string | undefined;
    const title = body?.title as string | undefined;
    const referrer = body?.referrer as string | undefined;

    if (!sessionIdRaw || !url) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: "Missing sessionId/url" }),
        { status: 400, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    const sessionId = sessionIdRaw as Id<"contactSessions">;

    await fetchMutation(api.public.contactSessions.setCurrentUrl, {
      sessionId,
      url,
      title,
      referrer,
    });

    return new NextResponse(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors },
    });
  } catch (err) {
    console.error("[set-current-url] error", err);
    return new NextResponse(
      JSON.stringify({ ok: false, error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...cors } }
    );
  }
}
