// apps/web/modules/dashboard/ui/components/SnapshotsStrip.tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";

export function SnapshotsStrip({
  sessionId,
  limit = 8,
}: {
  sessionId: Id<"contactSessions">;
  limit?: number;
}) {
  const snaps = useQuery(api.public.snapshots.listRecent, { sessionId, limit }) ?? [];
  if (!snaps.length) return null;

  return (
    <div className="mt-3 space-y-2">
      {snaps.map((s: any) => (
        <div
          key={s._id}
          className="rounded border bg-muted/30 px-3 py-2 text-xs"
        >
          <div className="font-medium truncate">
            {s.title || "Page visit"}
          </div>
          {s.pageUrl && (
            <a
              href={s.pageUrl}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-[11px] text-muted-foreground underline"
              title={s.pageUrl}
            >
              {s.pageUrl}
            </a>
          )}
          <div className="mt-1 text-[10px] text-muted-foreground">
            {s.width && s.height
              ? `${s.width}x${s.height} · ${new Date(s.ts).toLocaleString()}`
              : new Date(s.ts).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
