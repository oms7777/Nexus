import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const authCtx = await auth();
  const { userId, orgId } = authCtx;
  if (!userId || !orgId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const domain = String(body?.domain ?? "").trim();
  if (!domain) return new NextResponse("Missing domain", { status: 400 });

  const token = await authCtx.getToken({ template: "convex" });

  await fetchMutation(
    (api as any).private.websites.add,
    { domain },
    { token: token ?? undefined },
  );

  return NextResponse.json({ ok: true });
}

