// apps/web/app/api/tracker/snapshot/route.ts
import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";

export const runtime = "nodejs";

/*
  CORS universel pour widget embarqué
*/
function withCors(body: BodyInit | null, init: ResponseInit = {}, origin?: string | null) {
  const headers = new Headers(init.headers);

  headers.set("Access-Control-Allow-Origin", origin || "*");
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");

  return new NextResponse(body, { ...init, headers });
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return withCors(null, { status: 204 }, origin);
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");

  try {
    const { organizationId, sessionId, events } = await req.json();

    if (!organizationId || !sessionId || !Array.isArray(events) || events.length === 0) {
      return withCors(
        JSON.stringify({ ok: false, error: "Invalid payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
        origin
      );
    }

    // Extraction des infos depuis le snapshot rrweb
    const first = events[0] as any;

    const pageUrl: string | undefined = first?.data?.href;
    const title: string | undefined = first?.data?.title;
    const width: number | undefined = first?.data?.width;
    const height: number | undefined = first?.data?.height;

    // Snapshot stocké sous forme JSON stringifié
    const snapshot = JSON.stringify(events);

    await fetchMutation(api.public.snapshots.save, {
      organizationId,
      sessionId,
      pageUrl,
      title,
      width,
      height,
      snapshot, // ✅ correspond exactement à ton schéma
    });

    return withCors(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
      origin
    );
  } catch (err) {
    console.error("[snapshot] POST error", err);

    return withCors(
      JSON.stringify({ ok: false, error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
      origin
    );
  }
}
