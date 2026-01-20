import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";
import type { Id } from "@workspace/backend/_generated/dataModel";

export const runtime = "nodejs";

/**
 * CORS:
 * - origin reflect (pas de "*")
 * - compatible iframe/embed
 */
function makeCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const requestHeaders =
    req.headers.get("access-control-request-headers") ?? "content-type";

  const headers = new Headers();
  if (origin) headers.set("Access-Control-Allow-Origin", origin);

  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "POST,OPTIONS,GET");
  headers.set("Access-Control-Allow-Headers", requestHeaders);
  headers.set("Vary", "Origin, Access-Control-Request-Headers");
  return headers;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: makeCorsHeaders(req) });
}

// Heuristique simple: si ça ressemble à un external id / uuid / token long => mapping
function looksLikeExternalId(s: string) {
  return s.includes("-") || s.length > 40;
}

async function resolveSessionId(input: {
  organizationId: string;
  sessionIdRaw: string;
}): Promise<Id<"contactSessions">> {
  const { organizationId, sessionIdRaw } = input;

  if (looksLikeExternalId(sessionIdRaw)) {
    // Mode B: external session id → map vers Convex Id
    return await fetchMutation(api.public.contactSessions.ensureByExternalId, {
      organizationId,
      externalSessionId: sessionIdRaw,
    });
  }

  // Mode A: déjà un Convex Id
  return sessionIdRaw as Id<"contactSessions">;
}

async function saveSnapshot(input: {
  organizationId: string;
  sessionIdRaw: string;
  pageUrl: string;
  title?: string;
  width?: number;
  height?: number;
}) {
  const { organizationId, sessionIdRaw, pageUrl, title, width, height } = input;

  const contactSessionId = await resolveSessionId({ organizationId, sessionIdRaw });

  // ✅ V1: snapshot ultra léger (pas rrweb)
  const snapshotStr = JSON.stringify({
    v: 1,
    pageUrl,
    title,
    width,
    height,
    ts: Date.now(),
  });

  await fetchMutation(api.public.snapshots.save, {
    organizationId,
    sessionId: contactSessionId,
    pageUrl,
    title,
    width,
    height,
    snapshot: snapshotStr,
  });
}

export async function POST(req: Request) {
  const headers = makeCorsHeaders(req);

  try {
    const body = await req.json().catch(() => null);

    const organizationId = body?.organizationId as string | undefined;
    const sessionIdRaw = body?.sessionId as string | undefined;

    const pageUrl = body?.pageUrl as string | undefined;
    const title = body?.title as string | undefined;
    const width = typeof body?.width === "number" ? (body.width as number) : undefined;
    const height = typeof body?.height === "number" ? (body.height as number) : undefined;

    if (!organizationId || !sessionIdRaw || !pageUrl) {
      headers.set("Content-Type", "application/json");
      return new NextResponse(JSON.stringify({ ok: false, error: "Invalid payload" }), {
        status: 400,
        headers,
      });
    }

    await saveSnapshot({ organizationId, sessionIdRaw, pageUrl, title, width, height });

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

/**
 * ✅ CSP-proof fallback:
 * Si fetch POST est bloqué (connect-src), on enverra un pixel GET via <img>.
 */
export async function GET(req: Request) {
  const headers = makeCorsHeaders(req);

  try {
    const { searchParams } = new URL(req.url);

    const organizationId = searchParams.get("organizationId") ?? undefined;
    const sessionIdRaw = searchParams.get("sessionId") ?? undefined;
    const pageUrl = searchParams.get("pageUrl") ?? undefined;

    const title = searchParams.get("title") ?? undefined;

    const widthStr = searchParams.get("width");
    const heightStr = searchParams.get("height");
    const width = widthStr ? Number(widthStr) : undefined;
    const height = heightStr ? Number(heightStr) : undefined;

    if (!organizationId || !sessionIdRaw || !pageUrl) {
      return new NextResponse("", { status: 204, headers });
    }

    await saveSnapshot({
      organizationId,
      sessionIdRaw,
      pageUrl,
      title: title || undefined,
      width: typeof width === "number" && !Number.isNaN(width) ? width : undefined,
      height: typeof height === "number" && !Number.isNaN(height) ? height : undefined,
    });

    // pixel response
    return new NextResponse("", { status: 204, headers });
  } catch (err: any) {
    console.error("[snapshot] GET error", err);
    return new NextResponse("", { status: 204, headers });
  }
}
