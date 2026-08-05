"use client";

import { useOrganization } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

/**
 * Combines Clerk org role (admin/member) with app-level flags from Convex
 * (canManageTeam / canManagePromos) so we don't need Clerk custom roles.
 */
export function useOrgCapabilities(): {
  isLoaded: boolean;
  role: string;
  isAdmin: boolean;
  canManageTeam: boolean;
  canManagePromos: boolean;
  canManageOperations: boolean;
} {
  const { isLoaded: clerkLoaded, membership, organization } = useOrganization();
  const role = membership?.role ?? "";
  const caps = useQuery(
    api.team.getMyCapabilities,
    clerkLoaded && organization?.id ? {} : "skip",
  );

  const isAdmin = role === "org:admin" || caps?.isAdmin === true;
  const canManageTeam = Boolean(caps?.canManageTeam ?? isAdmin);
  const canManagePromos = Boolean(caps?.canManagePromos ?? isAdmin);
  const capsLoaded = !organization?.id || caps !== undefined;

  return {
    isLoaded: clerkLoaded && capsLoaded,
    role: caps?.orgRole || role,
    isAdmin,
    canManageTeam,
    canManagePromos,
    canManageOperations: canManageTeam || canManagePromos,
  };
}
