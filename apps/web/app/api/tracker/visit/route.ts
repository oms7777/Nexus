// apps/web/app/api/tracker/visit/route.ts
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@workspace/backend/_generated/api";


export const runtime = "nodejs";

// CORS permissif (le tracker tourne sur les sites de tes clients)
function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS,GET",
    "Access-Control-Allow-Headers": "content-type",
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

type Body = {
  organizationId?: string;
  sessionId?: string;
  pageUrl?: string;
  title?: string;
  referrer?: string;
  // pages/lastSeenAt arrivent du client mais setCurrentUrl gère déjà pages+lastSeenAt
  pages?: string[];
  lastSeenAt?: number;
};

function pickString(x: any) {
  return typeof x === "string" && x.trim().length ? x.trim() : undefined;
}

export async function POST(req: Request) {
  const headers = cors(req.headers.get("origin"));

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers });
  }

  const organizationId = pickString(body.organizationId);
  const sessionId = pickString(body.sessionId);
  const pageUrl = pickString(body.pageUrl);
  const title = pickString(body.title);
  const referrer = pickString(body.referrer);

  if (!organizationId || !sessionId || !pageUrl) {
    return NextResponse.json(
      { ok: false, error: "Missing organizationId/sessionId/pageUrl" },
      { status: 400, headers },
    );
  }

  try {
    const client = new ConvexHttpClient(process.env.CONVEX_URL!);

    // ✅ la mutation met à jour:
    // metadata.currentUrl, metadata.title, metadata.pages, metadata.lastSeenAt, expiresAt
    await client.mutation(api.public.contactSessions.setCurrentUrl, {
      sessionId: sessionId as any,
      url: pageUrl,
      title: title ?? undefined,
      referrer: referrer ?? undefined,
    });

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (e: any) {
    console.error("[tracker/visit] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500, headers },
    );
  }
}

// ✅ Fallback pixel GET (si CSP bloque fetch)
export async function GET(req: Request) {
  const headers = cors(req.headers.get("origin"));

  try {
    const url = new URL(req.url);
    const organizationId = pickString(url.searchParams.get("organizationId"));
    const sessionId = pickString(url.searchParams.get("sessionId"));
    const pageUrl = pickString(url.searchParams.get("pageUrl"));
    const title = pickString(url.searchParams.get("title"));
    const referrer = pickString(url.searchParams.get("referrer"));

    if (!organizationId || !sessionId || !pageUrl) {
      return new NextResponse(null, { status: 204, headers });
    }

    const client = new ConvexHttpClient(process.env.CONVEX_URL!);
    await client.mutation(api.public.contactSessions.setCurrentUrl, {
      sessionId: sessionId as any,
      url: pageUrl,
      title: title ?? undefined,
      referrer: referrer ?? undefined,
    });

    return new NextResponse(null, { status: 204, headers });
  } catch {
    return new NextResponse(null, { status: 204, headers });
  }
}