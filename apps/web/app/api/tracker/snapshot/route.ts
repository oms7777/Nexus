// apps/web/app/api/tracker/snapshot/route.ts
import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";

export async function POST(req: Request) {
  try {
    const { organizationId, sessionId, events } = await req.json();

    if (!organizationId || !sessionId || !Array.isArray(events)) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload" },
        { status: 400 },
      );
    }

    await fetchMutation(api.public.snapshots.save, {
      organizationId,
      sessionId,
      events,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[snapshot] POST error", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
