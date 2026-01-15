// apps/app/src/app/api/tracker/snapshot/route.ts (ou ton chemin exact)
import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "@rrweb/types";

export const runtime = "nodejs";

/**
 * ⚠️ CORS:
 * - si tu utilises credentials, il faut une allowlist stricte.
 * - ici on garde ton comportement actuel (origin reflect) mais on évite "*".
 */
function makeCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const requestHeaders =
    req.headers.get("access-control-request-headers") ?? "content-type";

  const headers = new Headers();

  // si pas d'origin (server-to-server), on n'invente pas "*"
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

function pickMetaFromEvents(events: eventWithTime[]) {
  const meta = events.find((e: any) => e?.type === 4) as any; // Meta
  const full = events.find((e: any) => e?.type === 2) as any; // FullSnapshot
  const first = events[0] as any;

  const src = meta?.data ?? full?.data ?? first?.data ?? {};

  return {
    pageUrl: (src?.href as string | undefined) ?? undefined,
    title: (src?.title as string | undefined) ?? undefined,
    width: (src?.width as number | undefined) ?? undefined,
    height: (src?.height as number | undefined) ?? undefined,
  };
}

// Heuristique simple: Convex Id ressemble souvent à un token non-uuid, sans tirets.
// On ne peut pas valider parfaitement sans appeler Convex, donc on supporte fallback.
function looksLikeExternalId(s: string) {
  // uuid v4 / ids avec tirets
  return s.includes("-") || s.length > 40;
}

export async function POST(req: Request) {
  const headers = makeCorsHeaders(req);

  try {
    const body = await req.json().catch(() => null);

    const organizationId = body?.organizationId as string | undefined;
    const sessionIdRaw = body?.sessionId as string | undefined;
    const events = body?.events as eventWithTime[] | undefined;

    if (!organizationId || !sessionIdRaw || !Array.isArray(events) || events.length === 0) {
      headers.set("Content-Type", "application/json");
      return new NextResponse(
        JSON.stringify({ ok: false, error: "Invalid payload" }),
        { status: 400, headers }
      );
    }

    // ✅ limite taille JSON (bien plus fiable que events.length)
    const snapshotStr = JSON.stringify(events);

    // Ajuste selon ton budget: 1.5–2MB en string max côté API
    // (Convex garde aussi une limite)
    if (snapshotStr.length > 2_000_000) {
      headers.set("Content-Type", "application/json");
      return new NextResponse(
        JSON.stringify({ ok: false, error: "Snapshot too large" }),
        { status: 413, headers }
      );
    }

    // ✅ obtenir un vrai Id<contactSessions>
    let contactSessionId: Id<"contactSessions">;

    if (looksLikeExternalId(sessionIdRaw)) {
      // Mode B: external session id → map vers Convex Id
      contactSessionId = await fetchMutation(api.public.contactSessions.ensureByExternalId, {
        organizationId,
        externalSessionId: sessionIdRaw,
      });
    } else {
      // Mode A: on tente direct
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
    // ✅ renvoie un message utile
    console.error("[snapshot] POST error", err);

    headers.set("Content-Type", "application/json");
    return new NextResponse(
      JSON.stringify({
        ok: false,
        error: "Internal error",
        detail: typeof err?.message === "string" ? err.message : undefined,
      }),
      { status: 500, headers }
    );
  }
}
