// apps/app/src/app/api/tracker/snapshot/route.ts
import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "rrweb/typings/types";

export const runtime = "nodejs";

function makeCors(origin: string, req: Request) {
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
  const origin = req.headers.get("origin");
  if (!origin) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: 204, headers: makeCors(origin, req) });
}

function pickMetaFromEvents(events: eventWithTime[]) {
  const meta = events.find((e: any) => e?.type === 4) as any;
  const full = events.find((e: any) => e?.type === 2) as any;
  const first = events[0] as any;

  const src = meta?.data ?? full?.data ?? first?.data ?? {};

  return {
    pageUrl: (src?.href as string | undefined) ?? undefined,
    title: (src?.title as string | undefined) ?? undefined,
    width: (src?.width as number | undefined) ?? undefined,
    height: (src?.height as number | undefined) ?? undefined,
  };
}

function looksLikeExternalId(s: string) {
  return s.includes("-") || s.length > 40;
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return new NextResponse("Missing origin", { status: 400 });

  const headers = makeCors(origin, req);

  try {
    const body = await req.json().catch(() => null);

    const organizationId = body?.organizationId as string | undefined;
    const sessionIdRaw = body?.sessionId as string | undefined;
    const events = body?.events as eventWithTime[] | undefined;

    if (!organizationId || !sessionIdRaw || !Array.isArray(events) || events.length === 0) {
      headers.set("Content-Type", "application/json");
      return new NextResponse(JSON.stringify({ ok: false, error: "Invalid payload" }), {
        status: 400,
        headers,
      });
    }

    // ✅ limite taille JSON
    const snapshotStr = JSON.stringify(events);
    if (snapshotStr.length > 2_000_000) {
      headers.set("Content-Type", "application/json");
      return new NextResponse(JSON.stringify({ ok: false, error: "Snapshot too large" }), {
        status: 413,
        headers,
      });
    }

    // ✅ obtenir un vrai Id<contactSessions>
    let contactSessionId: Id<"contactSessions">;

    if (looksLikeExternalId(sessionIdRaw)) {
      contactSessionId = await fetchMutation(api.public.contactSessions.ensureByExternalId, {
        organizationId,
        externalSessionId: sessionIdRaw,
      });
    } else {
      contactSessionId = sessionIdRaw as Id<"contactSessions">;
    }

    const { pageUrl, title, width, height } = pickMetaFromEvents(events);

    await fetchMutation(api.public.snapshots.save, {
      organizationId,
      sessionId: contactSessionId,
      pageUrl,
      title,
      width,
      height,
      snapshot: snapshotStr,
    });

    headers.set("Content-Type", "application/json");
    return new NextResponse(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err: any) {
    console.error("[snapshot] POST error", err);
    headers.set("Content-Type", "application/json");
    return new NextResponse(
      JSON.stringify({
        ok: false,
        error: "Internal error",
        detail: typeof err?.message === "string" ? err.message : undefined,
      }),
      { status: 500, headers },
    );
  }
}