"use client";

import Link from "next/link";
import { useOrgCapabilities } from "@/modules/auth/hooks/use-org-capabilities";

export function OperationsGate({
  title,
  children,
  require,
}: {
  title: string;
  children: React.ReactNode;
  /** Which app capability unlocks this page. Default: either ops flag. */
  require?: "team" | "promos" | "any";
}) {
  const { isLoaded, canManageTeam, canManagePromos, canManageOperations, isAdmin } =
    useOrgCapabilities();

  const allowed =
    require === "team"
      ? canManageTeam
      : require === "promos"
        ? canManagePromos
        : canManageOperations;

  if (!isLoaded) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-8">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          You don&apos;t have access to this area.
          {isAdmin
            ? " Unexpected — try refreshing."
            : " Ask an organization admin to enable Team or Promos access for you on Team & Territories."}
        </p>
        <Link href="/live" className="text-sm font-medium text-fuchsia-700 hover:underline">
          Back to Live Map
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
