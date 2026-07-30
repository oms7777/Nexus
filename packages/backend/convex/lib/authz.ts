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

/**
 * Day-to-day operations (team, routing, knowledge base, widget content) can be
 * delegated to a Clerk custom role. Admins always qualify.
 *
 * Until the org actually creates that custom role in Clerk, no JWT carries it,
 * so every manager-gated function stays admin-only — the check is a no-op.
 */
function isOrgManagerRole(role: string): boolean {
  if (isClerkOrgAdminRole(role)) return true;
  if (!role) return false;
  return role === "org:manager" || role === "manager";
}

type Actor = { orgId: string; userId: string; orgRole: string };

async function resolveActor(ctx: any): Promise<Actor> {
  const identity = (await requireIdentity(ctx)) as Record<string, unknown>;
  const orgId = identity.orgId as string | undefined;
  const userId = identity.subject as string | undefined;

  if (!orgId || !userId) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
  }

  return { orgId, userId, orgRole: extractOrgRoleFromIdentity(identity) };
}

export async function requireOrgAdmin(ctx: any): Promise<Actor> {
  const actor = await resolveActor(ctx);

  if (!isClerkOrgAdminRole(actor.orgRole)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message:
        "Admin role required. Ensure your Clerk JWT template for Convex includes the organization role (e.g. orgRole / org:admin).",
    });
  }

  return actor;
}

/** For org-wide operational settings that are safe to delegate to a manager. */
export async function requireOrgManager(ctx: any): Promise<Actor> {
  const actor = await resolveActor(ctx);

  if (!isOrgManagerRole(actor.orgRole)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Admin or manager role required to change this setting.",
    });
  }

  return actor;
}

/**
 * For writes that target a specific member.
 *
 * A rep may edit their own row, but editing someone else's availability or
 * territories silently reassigns that person's inbound leads, so it needs
 * team-management rights.
 */
export async function requireSelfOrOrgManager(ctx: any, targetUserId: string): Promise<Actor> {
  const actor = await resolveActor(ctx);

  if (actor.userId === targetUserId) {
    return actor;
  }

  if (!isOrgManagerRole(actor.orgRole)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Only an admin or manager can change another member's rep settings.",
    });
  }

  return actor;
}

