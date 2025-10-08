import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchMutation } from "convex/nextjs";

export async function POST(req: Request) {
  const body = await req.json();
  await fetchMutation(api.public.analytics.log, body);
  return NextResponse.json({ ok: true });
}
