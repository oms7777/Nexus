// apps/web/app/api/tracker/snapshot/route.ts
import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";

export const runtime = "nodejs";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // ✅ idem ici
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(req: Request) {
  try {
    const { organizationId, sessionId, events } = await req.json();

    if (!organizationId || !sessionId || !Array.isArray(events)) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    await fetchMutation(api.public.snapshots.save, {
      organizationId,
      sessionId,
      events,
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (err) {
    console.error("[snapshot] POST error", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
