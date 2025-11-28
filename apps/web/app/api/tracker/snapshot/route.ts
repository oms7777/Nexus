// apps/web/app/api/tracker/snapshot/route.ts
import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";

export const runtime = "nodejs";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

// (optionnel, juste pour ne pas avoir de 405 si tu testes en GET)
export async function GET() {
  return new NextResponse("OK", {
    status: 200,
    headers: CORS_HEADERS,
  });
}

export async function POST(req: Request) {
  try {
    const { organizationId, sessionId, events } = await req.json();

    if (!organizationId || !sessionId || !Array.isArray(events) || events.length === 0) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: "Invalid payload" }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
      );
    }

    // On prend le 1er event (snapshot) pour les meta
    const first = events[0] as any;

    const pageUrl: string | undefined = first?.data?.href;
    const title: string | undefined = first?.data?.title;
    const width: number | undefined = first?.data?.width;
    const height: number | undefined = first?.data?.height;

    const snapshot = JSON.stringify(events); // ✅ string pour Convex

    await fetchMutation(api.public.snapshots.save, {
      organizationId,
      sessionId,
      pageUrl,
      title,
      width,
      height,
      snapshot,
    });

    return new NextResponse(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  } catch (err) {
    console.error("[snapshot] POST error", err);
    return new NextResponse(
      JSON.stringify({ ok: false, error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }
}
