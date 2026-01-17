"use client";

import React, { useMemo } from "react";
import { api } from "@workspace/backend/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Switch } from "@workspace/ui/components/switch";
import { useOrganization, useUser } from "@clerk/nextjs";

type RepRow = {
  userId: string;
  available: boolean;
  name?: string;
  avatarUrl?: string;
  title?: string;
};

type MyPresence = { available: boolean } | null;

function AvatarCircle({
  src,
  alt,
  fallbackLetter,
  size = 28,
}: {
  src?: string;
  alt: string;
  fallbackLetter: string;
  size?: number;
}) {
  const s = `${size}px`;

  return (
    <div
      className="rounded-full ring-2 ring-background bg-muted overflow-hidden flex items-center justify-center"
      style={{ width: s, height: s }}
      title={alt}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} style={{ width: s, height: s }} className="object-cover" />
      ) : (
        <span className="text-xs font-medium">{fallbackLetter}</span>
      )}
    </div>
  );
}

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

  const shownOthers = useMemo(() => {
    const list = Array.isArray(reps) ? reps : [];
    const filtered = myId ? list.filter((r) => r.userId !== myId) : list;
    return filtered.slice(0, 5);
  }, [reps, myId]);

  if (!orgId) return null;

  return (
    <div className="flex items-center gap-3">
      {/* Me */}
      <div className="flex items-center gap-2">
        <AvatarCircle
          src={myAvatar}
          alt={`${myName}${myAvailable ? " • Available" : " • Away"}`}
          fallbackLetter={(myName?.[0] ?? "M").toUpperCase()}
          size={28}
        />

        <div className="hidden sm:flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Available</span>
          <Switch
            checked={myAvailable}
            onCheckedChange={(checked) => {
              setMyAvailability({ organizationId: orgId, available: !!checked }).catch(() => {});
            }}
          />
        </div>
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Other reps */}
      <div className="flex items-center -space-x-2">
        {shownOthers.length === 0 ? (
          <div className="text-xs text-muted-foreground">No reps available</div>
        ) : (
          shownOthers.map((r) => (
            <AvatarCircle
              key={r.userId}
              src={typeof r.avatarUrl === "string" && r.avatarUrl.trim() ? r.avatarUrl.trim() : undefined}
              alt={`${r.name ?? "Rep"}${r.title ? ` • ${r.title}` : ""}`}
              fallbackLetter={((r.name ?? "R")[0] ?? "R").toUpperCase()}
              size={28}
            />
          ))
        )}
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
