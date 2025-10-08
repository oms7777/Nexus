// apps/web/modules/dashboard/ui/components/SnapshotsStrip.tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";

export function SnapshotsStrip({ sessionId, limit = 8 }:{
  sessionId: Id<"contactSessions">; limit?: number;
}) {
  const snaps = useQuery(api.public.snapshots.listRecent, { sessionId, limit }) ?? [];
  if (!snaps.length) return null;

  return (
    <div className="mt-3 grid grid-cols-4 gap-2">
      {snaps.map((s: any) => (
        <a key={s._id} href={s.url} target="_blank" rel="noreferrer"
           className="block group overflow-hidden rounded border bg-muted/30">
          <img src={s.url} alt={s.title ?? ""} className="aspect-video object-cover transition group-hover:scale-105" />
        </a>
      ))}
    </div>
  );
}
