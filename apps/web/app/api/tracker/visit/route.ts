// apps/web/app/api/tracker/visit/route.ts
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@workspace/backend/_generated/api";

export const runtime = "nodejs";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":
    process.env.NODE_ENV === "production" ? "*" : "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS,GET",
  "Access-Control-Allow-Headers": "content-type",
};

function getConvex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
  if (!url) throw new Error("Missing CONVEX_URL / NEXT_PUBLIC_CONVEX_URL");
  return new ConvexHttpClient(url);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

type Body = {
  organizationId?: string;
  sessionId?: string;
  pageUrl?: string;
  title?: string;
  referrer?: string;
};

async function handleUpsert(payload: Body) {
  const organizationId = typeof payload.organizationId === "string" ? payload.organizationId : "";
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  const pageUrl = typeof payload.pageUrl === "string" ? payload.pageUrl : "";
  const title = typeof payload.title === "string" ? payload.title : undefined;

  if (!organizationId || !sessionId || !pageUrl) {
    return NextResponse.json({ ok: false, error: "Missing organizationId/sessionId/pageUrl" }, { status: 400, headers: CORS_HEADERS });
  }

  const convex = getConvex();

  // ✅ Patch metadata (currentUrl/title/pages/lastSeenAt + expiresAt bump)
  await convex.mutation(api.public.contactSessions.setCurrentUrl, {
    sessionId: sessionId as any,
    url: pageUrl,
    title,
    referrer: typeof payload.referrer === "string" ? payload.referrer : undefined,
  });

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    return await handleUpsert(body);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }
}

// ✅ Pixel fallback: /api/tracker/visit?organizationId=...&sessionId=...&pageUrl=...
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const body: Body = {
      organizationId: u.searchParams.get("organizationId") ?? undefined,
      sessionId: u.searchParams.get("sessionId") ?? undefined,
      pageUrl: u.searchParams.get("pageUrl") ?? undefined,
      title: u.searchParams.get("title") ?? undefined,
      referrer: u.searchParams.get("referrer") ?? undefined,
    };

    await handleUpsert(body);

    // return a 1x1 gif
    const gif = Buffer.from(
      "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
      "base64",
    );
    return new NextResponse(gif, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "image/gif",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
}