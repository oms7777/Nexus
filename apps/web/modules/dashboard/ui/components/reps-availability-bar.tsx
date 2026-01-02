"use client";

import React, { useMemo } from "react";
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

  // Pas d'org => rien à afficher
  if (!orgId) return null;

  const reps = useQuery(api.private.repsPresence.listAvailableForOrg, { organizationId: orgId }) as
    | RepRow[]
    | undefined;

  const me = useQuery(api.private.repsPresence.getMyPresence, { organizationId: orgId }) as
    | MyPresence
    | undefined;

  const setMyAvailability = useMutation(api.private.repsPresence.setMyAvailability);

  const myAvailable = !!me?.available;

  // ✅ Responsive: moins d'avatars sur petit écran
  const shown = useMemo(() => {
    const all = reps ?? [];
    // on garde 3 “par défaut”; tu peux augmenter si tu veux
    return all.slice(0, 10);
  }, [reps]);

  return (
    <div className="flex items-center gap-3 min-w-0">
      {/* Avatars */}
      <div className="flex items-center -space-x-2 min-w-0">
        {shown.length === 0 ? (
          <div className="hidden sm:block text-xs text-muted-foreground">No reps available</div>
        ) : (
          shown.map((r) => (
            <div
              key={r.userId}
              className="rounded-full ring-2 ring-background bg-muted"
              title={`${r.name ?? "Rep"}${r.title ? ` • ${r.title}` : ""}`}
            >
              {/* ✅ plus petit pour gagner de la place */}
              <DicebearAvatar imageUrl={r.avatarUrl} seed={r.userId} size={24} />
            </div>
          ))
        )}
      </div>

      {/* Switch */}
      <div className="flex items-center gap-2 shrink-0">
        {/* ✅ Cache le texte en mobile */}
        <span className="hidden sm:inline text-xs text-muted-foreground">Available</span>
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
