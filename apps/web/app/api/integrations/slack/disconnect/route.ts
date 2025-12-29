import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const authCtx = await auth();
  const { userId, orgId } = authCtx;

  if (!userId || !orgId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const convexToken = await authCtx.getToken({ template: "convex" });

  await fetchMutation(
    api.integrations.disconnectSlackIntegration,
    {},
    { token: convexToken ?? undefined }
  );

  return NextResponse.json({ ok: true });
}
