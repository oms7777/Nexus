// apps/app/src/app/api/tracker/snapshot/route.ts
import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import type { Id } from "@workspace/backend/_generated/dataModel";
import type { eventWithTime } from "rrweb/typings/types";

export const runtime = "nodejs";

function hostFromUrlMaybe(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function normalizeHost(h: string): string {
  const x = String(h ?? "").trim().toLowerCase();
  return x.startsWith("www.") ? x.slice(4) : x;
}

/** rrweb runs in the widget iframe — snapshot meta href is often widget.inboundless.co */
function isHostedWidgetPageUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "widget.inboundless.co" || h === "app.inboundless.co";
  } catch {
    return false;
  }
}

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
    // Embed (`visitor-tracker`) sends `pageUrl` for the host page; widget sends `visitorPageUrl`.
    const visitorPageUrlRaw = body?.visitorPageUrl ?? body?.pageUrl;
    const visitorPageUrl =
      typeof visitorPageUrlRaw === "string" ? visitorPageUrlRaw.trim() : undefined;

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

    const { pageUrl: metaPageUrl, title, width, height } = pickMetaFromEvents(events);
    const effectivePageUrl =
      visitorPageUrl && !isHostedWidgetPageUrl(visitorPageUrl)
        ? visitorPageUrl
        : metaPageUrl && !isHostedWidgetPageUrl(metaPageUrl)
          ? metaPageUrl
          : visitorPageUrl || metaPageUrl;

    const originHost = hostFromUrlMaybe(origin);
    const pageHost = hostFromUrlMaybe(effectivePageUrl);
    // Allowlist must use the real visitor site when the iframe rrweb meta href is widget.inboundless.co.
    let incomingHost = "";
    if (
      typeof visitorPageUrl === "string" &&
      visitorPageUrl.trim() &&
      !isHostedWidgetPageUrl(visitorPageUrl)
    ) {
      incomingHost = normalizeHost(hostFromUrlMaybe(visitorPageUrl.trim()) ?? "");
    }
    if (!incomingHost) {
      incomingHost = normalizeHost(pageHost ?? originHost ?? "");
    }

    if (!incomingHost) {
      headers.set("Content-Type", "application/json");
      return new NextResponse(JSON.stringify({ ok: false, error: "Missing page host" }), {
        status: 400,
        headers,
      });
    }

    // ✅ Enterprise safety: accept snapshots only from allowed domains.
    const allow = await fetchQuery((api as any).public.websites.isAllowedHostname, {
      organizationId,
      hostname: incomingHost,
    }).catch(() => null);

    if (!allow?.allowed) {
      headers.set("Content-Type", "application/json");
      return new NextResponse(JSON.stringify({ ok: false, error: "Domain not allowed" }), {
        status: 403,
        headers,
      });
    }

    await fetchMutation(api.public.snapshots.save, {
      organizationId,
      sessionId: contactSessionId,
      pageUrl: effectivePageUrl,
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