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
  if (role === "admin") return true;
  return false;
}

/** Optional Clerk custom role (B2B add-on). Harmless no-op until the role exists. */
function isClerkOrgManagerRole(role: string): boolean {
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

async function loadRepCaps(ctx: any, orgId: string, userId: string) {
  const row = await ctx.db
    .query("repsPresence")
    .withIndex("by_org_user", (q: any) => q.eq("organizationId", orgId).eq("userId", userId))
    .unique();
  return {
    canManageTeam: Boolean(row?.canManageTeam),
    canManagePromos: Boolean(row?.canManagePromos),
  };
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

/** Team & territories (RevOps). Admin, Clerk manager, or app flag. */
export async function requireCanManageTeam(ctx: any): Promise<Actor> {
  const actor = await resolveActor(ctx);
  if (isClerkOrgManagerRole(actor.orgRole)) return actor;
  const caps = await loadRepCaps(ctx, actor.orgId, actor.userId);
  if (caps.canManageTeam) return actor;
  throw new ConvexError({
    code: "FORBIDDEN",
    message: "Team management access required (ask an admin to enable it on Team).",
  });
}

/** Promos / nudges (Marketing). Admin, Clerk manager, or app flag. */
export async function requireCanManagePromos(ctx: any): Promise<Actor> {
  const actor = await resolveActor(ctx);
  if (isClerkOrgManagerRole(actor.orgRole)) return actor;
  const caps = await loadRepCaps(ctx, actor.orgId, actor.userId);
  if (caps.canManagePromos) return actor;
  throw new ConvexError({
    code: "FORBIDDEN",
    message: "Promo management access required (ask an admin to enable it on Team).",
  });
}

/**
 * Broader ops (KB, widget shell): admin, Clerk manager, or either app flag.
 * Integrations / audit stay requireOrgAdmin.
 */
export async function requireOrgManager(ctx: any): Promise<Actor> {
  const actor = await resolveActor(ctx);
  if (isClerkOrgManagerRole(actor.orgRole)) return actor;
  const caps = await loadRepCaps(ctx, actor.orgId, actor.userId);
  if (caps.canManageTeam || caps.canManagePromos) return actor;
  throw new ConvexError({
    code: "FORBIDDEN",
    message: "Admin or operations access required to change this setting.",
  });
}

export async function requireSelfOrOrgManager(ctx: any, targetUserId: string): Promise<Actor> {
  const actor = await resolveActor(ctx);

  if (actor.userId === targetUserId) {
    return actor;
  }

  if (isClerkOrgManagerRole(actor.orgRole)) return actor;
  const caps = await loadRepCaps(ctx, actor.orgId, actor.userId);
  if (caps.canManageTeam) return actor;

  throw new ConvexError({
    code: "FORBIDDEN",
    message: "Only an admin or team manager can change another member's rep settings.",
  });
}

/** Caps for the signed-in user — drives sidebar / gates. */
export async function getActorCapabilities(ctx: any): Promise<{
  orgId: string;
  userId: string;
  orgRole: string;
  isAdmin: boolean;
  canManageTeam: boolean;
  canManagePromos: boolean;
  canManageOperations: boolean;
}> {
  const actor = await resolveActor(ctx);
  const isAdmin = isClerkOrgAdminRole(actor.orgRole);
  const clerkManager = isClerkOrgManagerRole(actor.orgRole);
  const caps = await loadRepCaps(ctx, actor.orgId, actor.userId);
  const canManageTeam = isAdmin || clerkManager || caps.canManageTeam;
  const canManagePromos = isAdmin || clerkManager || caps.canManagePromos;
  return {
    ...actor,
    isAdmin,
    canManageTeam,
    canManagePromos,
    canManageOperations: canManageTeam || canManagePromos,
  };
}
