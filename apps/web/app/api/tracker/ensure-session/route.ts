// apps/web/app/api/tracker/ensure-session/route.ts
import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";
import type { Id } from "@workspace/backend/_generated/dataModel";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();

  const organizationId = body?.organizationId as string | undefined;
  const convexSessionId = body?.convexSessionId as Id<"contactSessions"> | undefined;
  const metadata = body?.metadata;

  if (!organizationId) {
    return NextResponse.json({ ok: false, error: "Missing organizationId" }, { status: 400 });
  }

  // ✅ If we already have a Convex Id, just touch it (reuse)
  if (convexSessionId) {
    const id = await fetchMutation(api.public.contactSessions.ensure, {
      organizationId,
      sessionId: convexSessionId,
      metadata,
    });
    return NextResponse.json({ ok: true, sessionId: id });
  }

  // ✅ Otherwise create an anonymous session (ensure without sessionId)
  const id = await fetchMutation(api.public.contactSessions.ensure, {
    organizationId,
    sessionId: undefined,
    metadata,
  });

  return NextResponse.json({ ok: true, sessionId: id });
}
