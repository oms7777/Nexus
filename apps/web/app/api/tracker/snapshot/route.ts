// apps/app/src/app/api/tracker/snapshot/route.ts
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
  headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", requestHeaders);
  headers.set("Vary", "Origin, Access-Control-Request-Headers");
  return headers;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: makeCorsHeaders(req) });
}

// Heuristique simple: si ça ressemble à un external id / uuid / token long => mapping
function looksLikeExternalId(s: string) {
  return s.includes("-");
}

export async function POST(req: Request) {
  const headers = makeCorsHeaders(req);

  try {
    const body = await req.json().catch(() => null);

    const organizationId = body?.organizationId as string | undefined;
    const sessionIdRaw = body?.sessionId as string | undefined;

    const pageUrl = body?.pageUrl as string | undefined;
    const title = body?.title as string | undefined;
    const width =
      typeof body?.width === "number" ? (body.width as number) : undefined;
    const height =
      typeof body?.height === "number" ? (body.height as number) : undefined;

    if (!organizationId || !sessionIdRaw || !pageUrl) {
      headers.set("Content-Type", "application/json");
      return new NextResponse(
        JSON.stringify({ ok: false, error: "Invalid payload" }),
        { status: 400, headers },
      );
    }

    // ✅ obtenir un vrai Id<"contactSessions">
    let contactSessionId: Id<"contactSessions">;

    if (looksLikeExternalId(sessionIdRaw)) {
      // Mode B: external session id → map vers Convex Id
      contactSessionId = await fetchMutation(
        api.public.contactSessions.ensureByExternalId,
        {
          organizationId,
          externalSessionId: sessionIdRaw,
        },
      );
    } else {
      // Mode A: déjà un Convex Id
      contactSessionId = sessionIdRaw as Id<"contactSessions">;
    }

    // ✅ V1: snapshot ultra léger (pas rrweb)
    // On garde un champ snapshot string pour compat schema.
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
