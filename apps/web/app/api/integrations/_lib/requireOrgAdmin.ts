import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function requireOrgAdminOrResponse(): Promise<
  | { ok: true; authCtx: Awaited<ReturnType<typeof auth>>; userId: string; orgId: string }
  | { ok: false; response: NextResponse }
> {
  const authCtx = await auth();
  const { userId, orgId } = authCtx;
  if (!userId || !orgId) {
    return { ok: false, response: new NextResponse("Unauthorized", { status: 401 }) };
  }

  // Resolve role from Clerk directly (do not rely on JWT template contents).
  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({
    userId,
    limit: 100,
  });
  const membership = memberships.data.find((m: any) => m.organization.id === orgId);
  if (!membership || membership.role !== "org:admin") {
    return { ok: false, response: new NextResponse("Forbidden (admin required)", { status: 403 }) };
  }

  return { ok: true, authCtx, userId, orgId };
}

