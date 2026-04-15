import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const authCtx = await auth();
  const { userId, orgId } = authCtx;
  if (!userId || !orgId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const websiteId = String(body?.websiteId ?? "").trim();
  if (!websiteId) return new NextResponse("Missing websiteId", { status: 400 });

  const token = await authCtx.getToken({ template: "convex" });

  await fetchMutation(
    (api as any).private.websites.remove,
    { websiteId: websiteId as Id<"websites"> },
    { token: token ?? undefined },
  );

  return NextResponse.json({ ok: true });
}

