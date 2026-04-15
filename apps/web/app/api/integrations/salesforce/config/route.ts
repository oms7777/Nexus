import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@workspace/backend/_generated/api";
import { requireOrgAdminOrResponse } from "../../_lib/requireOrgAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await requireOrgAdminOrResponse();
  if (!guard.ok) return guard.response;
  const { authCtx } = guard;

  const body = await req.json().catch(() => null);
  if (!body) return new NextResponse("Invalid JSON", { status: 400 });

  const clientId = String(body.clientId ?? "").trim();
  const clientSecret = String(body.clientSecret ?? "").trim();
  const loginUrl = String(body.loginUrl ?? "https://login.salesforce.com").trim();

  if (!clientId || !clientSecret || !loginUrl) {
    return new NextResponse("Missing fields", { status: 400 });
  }

  const convexToken = await authCtx.getToken({ template: "convex" });

  await fetchMutation(
    api.integrations.upsertSalesforceAppConfig,
    {
      clientId,
      clientSecret,
      loginUrl,
    },
    { token: convexToken ?? undefined }
  );

  return NextResponse.json({ ok: true });
}
