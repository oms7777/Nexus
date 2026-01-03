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

const MAX_AVATARS = 10;

export function RepsAvailabilityBar({ organizationId }: { organizationId?: string }) {
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

  const setMyAvailability = useMutation(api.private.repsPresence.setMyAvailability);

  const myAvailable = !!mePresence?.available;

  const myId = isLoaded ? user?.id : undefined;

  const { shown, remainingCount, onlineCount } = useMemo(() => {
    const list = Array.isArray(reps) ? reps : [];

    // listAvailableForOrg est déjà "available only", mais on sécurise
    const availableOnly = list.filter((r) => !!r.available);

    // on enlève "me" de la liste des avatars, car Clerk affiche déjà ton avatar à droite
    const others = myId ? availableOnly.filter((r) => r.userId !== myId) : availableOnly;

    const shownAvatars = others.slice(0, MAX_AVATARS);
    const remaining = Math.max(0, others.length - shownAvatars.length);

    // count total online = others + me si dispo
    const totalOnline = others.length + (myAvailable ? 1 : 0);

    return {
      shown: shownAvatars,
      remainingCount: remaining,
      onlineCount: totalOnline,
    };
  }, [reps, myId, myAvailable]);

  if (!orgId) return null;

  return (
    <div className="flex items-center gap-3">
      {/* Availability toggle */}
      <div className="flex items-center gap-2">
        <span className="hidden sm:block text-xs text-muted-foreground">Available</span>
        <Switch
          checked={myAvailable}
          onCheckedChange={(checked) => {
            setMyAvailability({ organizationId: orgId, available: !!checked }).catch(() => {});
          }}
        />
      </div>

      {/* Online avatars */}
      <div className="flex items-center gap-2">
        <div className="flex items-center -space-x-2 flex-shrink-0">
          {shown.map((r) => (
            <div
              key={r.userId}
              className="rounded-full ring-2 ring-background bg-muted"
              title={`${r.name ?? "Rep"}${r.title ? ` • ${r.title}` : ""}`}
            >
              <DicebearAvatar imageUrl={r.avatarUrl} seed={r.userId} size={28} />
            </div>
          ))}

          {remainingCount > 0 ? (
            <div
              className="h-7 min-w-7 px-2 rounded-full ring-2 ring-background bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground"
              title={`${remainingCount} more rep(s) online`}
            >
              +{remainingCount}
            </div>
          ) : null}
        </div>

        {/* Count (what you already have, but kept consistent) */}
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {Math.max(0, onlineCount)} online
        </div>
      </div>
    </div>
  );
}
