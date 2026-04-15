import { ConvexError } from "convex/values";

export type IdentityLike = {
  orgId?: string;
  orgRole?: string;
  subject?: string;
};

export async function requireIdentity(ctx: any): Promise<IdentityLike> {
  const identity = (await ctx.auth.getUserIdentity()) as IdentityLike | null;
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
  }
  return identity;
}

export async function requireOrgId(ctx: any): Promise<string> {
  const identity = await requireIdentity(ctx);
  const orgId = identity.orgId as string | undefined;
  if (!orgId) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
  }
  return orgId;
}

/**
 * Enterprise-safe rule: only Clerk org admins can mutate org settings.
 *
 * IMPORTANT:
 * - This assumes the Clerk "convex" JWT template includes an `orgRole` claim (e.g. "org:admin").
 * - If `orgRole` is missing, we deny by default (secure).
 */
/** For audit logs / UI — not used as the sole authorization gate. */
export function readOrgRoleFromIdentity(identity: Record<string, unknown> | null | undefined): string {
  if (!identity) return "";
  return extractOrgRoleFromIdentity(identity);
}

function extractOrgRoleFromIdentity(identity: Record<string, unknown>): string {
  const i = identity as Record<string, any>;
  const direct =
    i.orgRole ??
    i.org_role ??
    i.organizationRole ??
    (typeof i.o === "object" && i.o ? (i.o as any).rol ?? (i.o as any).role : undefined);
  return typeof direct === "string" ? direct.trim() : "";
}

function isClerkOrgAdminRole(role: string): boolean {
  if (!role) return false;
  if (role === "org:admin") return true;
  // Some JWT templates shorten or use different casing
  if (role === "admin") return true;
  return false;
}

export async function requireOrgAdmin(ctx: any): Promise<{
  orgId: string;
  userId: string;
  orgRole: string;
}> {
  const identity = (await requireIdentity(ctx)) as Record<string, unknown>;
  const orgId = identity.orgId as string | undefined;
  const userId = identity.subject as string | undefined;
  const orgRole = extractOrgRoleFromIdentity(identity);

  if (!orgId || !userId) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
  }

  if (!isClerkOrgAdminRole(orgRole)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message:
        "Admin role required. Ensure your Clerk JWT template for Convex includes the organization role (e.g. orgRole / org:admin).",
    });
  }

  return { orgId, userId, orgRole };
}

