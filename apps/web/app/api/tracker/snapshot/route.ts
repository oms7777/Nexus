import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "@rrweb/types";

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

function pickMetaFromEvents(events: eventWithTime[]) {
  const full = events.find((e: any) => e?.type === 2) as any;
  const first = events[0] as any;
  const src = full?.data ?? first?.data ?? {};
  return {
    pageUrl: src?.href as string | undefined,
    title: src?.title as string | undefined,
    width: src?.width as number | undefined,
    height: src?.height as number | undefined,
  };
}

export async function POST(req: Request) {
  const headers = cors(req);

  try {
    const body = await req.json();

    const organizationId = body?.organizationId as string | undefined;
    const sessionIdRaw = body?.sessionId as string | undefined; // Convex Id string
    const events = body?.events as eventWithTime[] | undefined;

    if (!organizationId || !sessionIdRaw || !Array.isArray(events) || events.length === 0) {
      headers.set("Content-Type", "application/json");
      return new NextResponse(JSON.stringify({ ok: false, error: "Invalid payload" }), {
        status: 400,
        headers,
      });
    }

    const sessionId = sessionIdRaw as Id<"contactSessions">;
    const { pageUrl, title, width, height } = pickMetaFromEvents(events);

    await fetchMutation(api.public.snapshots.save, {
      organizationId,
      sessionId,
      pageUrl,
      title,
      width,
      height,
      snapshot: JSON.stringify(events),
    });

    headers.set("Content-Type", "application/json");
    return new NextResponse(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    console.error("[snapshot] POST error", err);
    headers.set("Content-Type", "application/json");
    return new NextResponse(JSON.stringify({ ok: false, error: "Internal error" }), {
      status: 500,
      headers,
    });
  }
}
