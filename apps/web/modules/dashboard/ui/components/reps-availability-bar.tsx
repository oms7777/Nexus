"use client";

import React from "react";
import { api } from "@workspace/backend/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Switch } from "@workspace/ui/components/switch";
import { DicebearAvatar } from "@workspace/ui/components/dicebear-avatar";
import { useOrganization } from "@clerk/nextjs";

type RepRow = {
  userId: string;
  available: boolean;
  name?: string;
  avatarUrl?: string;
  title?: string;
};

type MyPresence = { available: boolean } | null;

export function RepsAvailabilityBar({ organizationId }: { organizationId?: string }) {
  const { organization } = useOrganization();
  const orgId = organizationId ?? organization?.id;

  // ✅ IMPORTANT: hooks toujours appelés, avec "skip" si pas d'orgId
  const reps = useQuery(
    api.private.repsPresence.listAvailableForOrg,
    orgId ? { organizationId: orgId } : "skip",
  ) as RepRow[] | undefined;

  const me = useQuery(
    api.private.repsPresence.getMyPresence,
    orgId ? { organizationId: orgId } : "skip",
  ) as MyPresence | undefined;

  const setMyAvailability = useMutation(api.private.repsPresence.setMyAvailability);

  if (!orgId) return null;

  const myAvailable = !!me?.available;
  const shown = (reps ?? []).slice(0, 5);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center -space-x-2">
        {shown.length === 0 ? (
          <div className="text-xs text-muted-foreground">No reps available</div>
        ) : (
          shown.map((r) => (
            <div
              key={r.userId}
              className="rounded-full ring-2 ring-background bg-muted"
              title={`${r.name ?? "Rep"}${r.title ? ` • ${r.title}` : ""}`}
            >
              <DicebearAvatar imageUrl={r.avatarUrl} seed={r.userId} size={28} />
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Available</span>
        <Switch
          checked={myAvailable}
          onCheckedChange={(checked) => {
            setMyAvailability({ organizationId: orgId, available: !!checked }).catch(() => {});
          }}
        />
      </div>
    </div>
  );
}
