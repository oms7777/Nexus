import { NextResponse } from "next/server";
import { api } from "@workspace/backend/_generated/api";
import { fetchAction } from "convex/nextjs";

export async function POST(req: Request) {
  const body = await req.json();
  await fetchAction(api.public.snapshots.save, body);
  return NextResponse.json({ ok: true });
}
