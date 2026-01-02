"use client";

import { api } from "@workspace/backend/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Switch } from "@workspace/ui/components/switch";
import { DicebearAvatar } from "@workspace/ui/components/dicebear-avatar";

export function RepsAvailabilityBar({ organizationId }: { organizationId: string }) {
  const reps = useQuery(api.private.repsPresence.listAvailableForOrg, { organizationId }) as any[] | undefined;
  const me = useQuery(api.private.repsPresence.getMyPresence, { organizationId }) as any | null | undefined;
  const setMyAvailability = useMutation(api.private.repsPresence.setMyAvailability);

  const myAvailable = !!me?.available;

  return (
    <div className="flex items-center gap-3">
      {/* Avatars reps dispo */}
      <div className="flex items-center -space-x-2">
        {(reps ?? []).slice(0, 5).map((r) => (
          <div
            key={r.userId}
            className="rounded-full ring-2 ring-background bg-muted"
            title={`${r.name ?? "Rep"}${r.title ? ` • ${r.title}` : ""}`}
          >
            <DicebearAvatar imageUrl={r.avatarUrl} seed={r.userId} size={28} />
          </div>
        ))}
      </div>

      {/* Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Available</span>
        <Switch
          checked={myAvailable}
          onCheckedChange={(checked) => {
            setMyAvailability({ organizationId, available: !!checked }).catch(() => {});
          }}
        />
      </div>
    </div>
  );
}
