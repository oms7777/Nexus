"use client";

import { useOrganization } from "@clerk/nextjs";

/**
 * Roles allowed to run day-to-day operations (team, routing, knowledge base,
 * widget content). Must stay in sync with isOrgManagerRole in
 * packages/backend/convex/lib/authz.ts — the backend is the real gate.
 *
 * "org:manager" is an optional Clerk custom role: as long as the org has not
 * created it, no member carries it and these surfaces stay admin-only.
 */
const OPERATIONS_ROLES: readonly string[] = ["org:admin", "org:manager"];

export function useOrgCapabilities(): {
  isLoaded: boolean;
  role: string;
  isAdmin: boolean;
  canManageOperations: boolean;
} {
  const { isLoaded, membership } = useOrganization();
  const role = membership?.role ?? "";

  return {
    isLoaded,
    role,
    isAdmin: role === "org:admin",
    canManageOperations: OPERATIONS_ROLES.includes(role),
  };
}
