import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";

export async function POST(req: Request) {
  const { organizationId, sessionId, metadata } = await req.json();
  const id = await fetchMutation(api.public.contactSessions.ensure, {
    organizationId,
    sessionId,
    metadata,
  });
  return NextResponse.json({ sessionId: id });
}
