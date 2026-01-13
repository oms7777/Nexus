import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";
import type { Id } from "@workspace/backend/_generated/dataModel";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();

  const organizationId = body?.organizationId as string | undefined;

  // ✅ Either one of these can be provided
  const convexSessionId = body?.convexSessionId as Id<"contactSessions"> | undefined;
  const externalSessionId = body?.externalSessionId as string | undefined;

  const metadata = body?.metadata;

  if (!organizationId) {
    return NextResponse.json({ ok: false, error: "Missing organizationId" }, { status: 400 });
  }

  // ✅ Preferred: external string id from embed
  if (externalSessionId) {
    const id = await fetchMutation(api.public.contactSessions.ensureByExternalId, {
      organizationId,
      externalSessionId,
      metadata,
    });
    return NextResponse.json({ ok: true, sessionId: id });
  }

  // ✅ If we already have a Convex Id, reuse it
  if (convexSessionId) {
    const id = await fetchMutation(api.public.contactSessions.ensure, {
      organizationId,
      sessionId: convexSessionId,
      metadata,
    });
    return NextResponse.json({ ok: true, sessionId: id });
  }

  // ✅ Otherwise create an anonymous session
  const id = await fetchMutation(api.public.contactSessions.ensure, {
    organizationId,
    sessionId: undefined,
    metadata,
  });

  return NextResponse.json({ ok: true, sessionId: id });
}
