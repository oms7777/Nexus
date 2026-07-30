"use client";

import { Protect } from "@clerk/nextjs";
import Link from "next/link";
import { useOrgCapabilities } from "@/modules/auth/hooks/use-org-capabilities";

/**
 * Soft gate for day-to-day ops pages (team, knowledge base, widget).
 * Backend still enforces requireOrgManager — this only stops a blank crash.
 */
export function OperationsGate({
  children,
  title = "Restricted",
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const { isLoaded, canManageOperations } = useOrgCapabilities();

  if (!isLoaded) return null;

  if (!canManageOperations) {
    return (
      <Protect>
        <div className="mx-auto max-w-lg space-y-4 p-8">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-muted-foreground">
            This area is for organization admins and managers. Ask an admin to
            grant you the <span className="font-medium">Manager</span> or{" "}
            <span className="font-medium">Admin</span> role.
          </p>
          <Link href="/home" className="text-sm font-medium underline underline-offset-4">
            Back to home
          </Link>
        </div>
      </Protect>
    );
  }

  return <Protect>{children}</Protect>;
}
