// apps/web/modules/dashboard/ui/components/reps-availability-bar.tsx
"use client";

import React, { useMemo } from "react";
import { api } from "@workspace/backend/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Switch } from "@workspace/ui/components/switch";
import { DicebearAvatar } from "@workspace/ui/components/dicebear-avatar";
import { useOrganization, useUser } from "@clerk/nextjs";

type RepRow = {
  userId: string;
  available: boolean;
  name?: string;
  avatarUrl?: string;
  title?: string;
};

type MyPresence = { available: boolean } | null;

export function RepsAvailabilityBar({
  organizationId,
}: {
  organizationId?: string;
}) {
  const { organization } = useOrganization();
  const { user, isLoaded } = useUser();
  const orgId = organizationId ?? organization?.id;

  const reps = useQuery(
    api.private.repsPresence.listAvailableForOrg,
    orgId ? { organizationId: orgId } : "skip",
  ) as RepRow[] | undefined;

  const mePresence = useQuery(
    api.private.repsPresence.getMyPresence,
    orgId ? { organizationId: orgId } : "skip",
  ) as MyPresence | undefined;

  const setMyAvailability = useMutation(
    api.private.repsPresence.setMyAvailability,
  );

  const myAvailable = !!mePresence?.available;

  const myId = isLoaded ? user?.id : undefined;
  const myName = isLoaded ? user?.fullName ?? user?.username ?? "Me" : "Me";
  const myAvatar = isLoaded ? user?.imageUrl : undefined;

  const shownOthers = useMemo(() => {
    const list = Array.isArray(reps) ? reps : [];
    // On évite de dupliquer "me" si tu es dans la liste available
    const filtered = myId ? list.filter((r) => r.userId !== myId) : list;
    return filtered.slice(0, 5);
  }, [reps, myId]);

  if (!orgId) return null;

  return (
    <div className="flex items-center gap-3">
      {/* Me */}
      <div className="flex items-center gap-2">
        <div
          className="rounded-full ring-2 ring-background bg-muted"
          title={`${myName}${myAvailable ? " • Available" : " • Away"}`}
        >
          <DicebearAvatar
            imageUrl={myAvatar}
            seed={myId ?? "me"}
            size={28}
          />
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Available</span>
          <Switch
            checked={myAvailable}
            onCheckedChange={(checked) => {
              setMyAvailability({
                organizationId: orgId,
                available: !!checked,
              }).catch(() => {});
            }}
          />
        </div>
      </div>

      {/* Separator */}
      <div className="h-6 w-px bg-border" />

      {/* Other reps */}
      <div className="flex items-center -space-x-2">
        {shownOthers.length === 0 ? (
          <div className="text-xs text-muted-foreground">No reps available</div>
        ) : (
          shownOthers.map((r) => (
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

      {/* Mobile switch (si tu veux le switch visible sur mobile aussi) */}
      <div className="sm:hidden flex items-center gap-2">
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
