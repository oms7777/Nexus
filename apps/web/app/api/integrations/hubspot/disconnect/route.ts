import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";
import { requireOrgAdminOrResponse } from "../../_lib/requireOrgAdmin";

export const runtime = "nodejs";

export async function POST() {
  const guard = await requireOrgAdminOrResponse();
  if (!guard.ok) return guard.response;
  const { authCtx } = guard;

  const convexToken = await authCtx.getToken({ template: "convex" });

  await fetchMutation(
    api.integrations.disconnectHubSpotIntegration,
    {},
    { token: convexToken ?? undefined }
  );

  return NextResponse.json({ ok: true });
}
