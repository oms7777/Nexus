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

const MAX_AVATARS = 10; // ✅ max total avatars shown (me + others)

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
  const myName = isLoaded ? user?.fullName ?? user?.username ?? "Me" : "Me";
  const myAvatar = isLoaded ? user?.imageUrl : undefined;

  const { shownOthers, remainingCount, onlineCount } = useMemo(() => {
    const list = Array.isArray(reps) ? reps : [];

    // Important: listAvailableForOrg est censé déjà être "available only",
    // mais on refiltre safe au cas où.
    const availableOnly = list.filter((r) => !!r.available);

    const filtered = myId ? availableOnly.filter((r) => r.userId !== myId) : availableOnly;

    // ✅ show up to 10 total avatars incl. "me" => others max 9
    const maxOthers = Math.max(0, MAX_AVATARS - 1);
    const shown = filtered.slice(0, maxOthers);
    const remaining = Math.max(0, filtered.length - shown.length);

    return {
      shownOthers: shown,
      remainingCount: remaining,
      onlineCount: availableOnly.length + (myAvailable ? 1 : 0), // rough but ok even if "me" not in list
    };
  }, [reps, myId, myAvailable]);

  if (!orgId) return null;

  return (
    <div className="flex items-center gap-3">
      {/* Me */}
      <div className="flex items-center gap-2">
        <div
          className="rounded-full ring-2 ring-background bg-muted"
          title={`${myName}${myAvailable ? " • Available" : " • Away"}`}
        >
          <DicebearAvatar imageUrl={myAvatar} seed={myId ?? "me"} size={28} />
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

      {/* Others */}
      <div className="flex items-center gap-2">
        <div className="flex items-center -space-x-2">
          {shownOthers.length === 0 ? (
            <div className="text-xs text-muted-foreground">No reps available</div>
          ) : (
            <>
              {shownOthers.map((r) => (
                <div
                  key={r.userId}
                  className="rounded-full ring-2 ring-background bg-muted"
                  title={`${r.name ?? "Rep"}${r.title ? ` • ${r.title}` : ""}`}
                >
                  <DicebearAvatar imageUrl={r.avatarUrl} seed={r.userId} size={28} />
                </div>
              ))}

              {/* +N bubble */}
              {remainingCount > 0 ? (
                <div
                  className="h-7 min-w-7 px-2 rounded-full ring-2 ring-background bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground"
                  title={`${remainingCount} more rep(s) available`}
                >
                  +{remainingCount}
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* small count */}
        <div className="hidden md:block text-xs text-muted-foreground">
          {Math.max(0, onlineCount)} online
        </div>
      </div>

      {/* Mobile switch */}
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
