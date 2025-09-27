// apps/web/components/PresenceToggle.tsx
"use client";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useState, useEffect } from "react";
import { cn } from "@workspace/ui/lib/utils";

export default function PresenceToggle() {
  const me = useQuery(api.private.reps.me, {});
  const setAvailability = useMutation(api.private.reps.setAvailability);

  const [available, setAvailable] = useState(false);
  const [role, setRole] = useState<"sales" | "support">("support");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me) {
      setAvailable(!!me.available);
      setRole((me.role as "sales" | "support") ?? "support");
    }
  }, [me]);

  const save = async (next: { role?: "sales" | "support"; available?: boolean }) => {
    setSaving(true);
    try {
      await setAvailability({
        role: (next.role ?? role) as "sales" | "support",
        available: (next.available ?? available) as boolean,
        regions: me?.regions ?? ["EMEA"], // tweak if needed
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        className="border rounded px-2 py-1 text-sm"
        value={role}
        onChange={async (e) => {
          const r = e.target.value as "sales" | "support";
          setRole(r);
          await save({ role: r }); // <-- persist on role change too
        }}
        disabled={saving}
      >
        <option value="sales">Sales</option>
        <option value="support">Support</option>
      </select>

      <button
        onClick={async () => {
          const next = !available;
          setAvailable(next);
          await save({ available: next }); // <-- upsert on first click if needed
        }}
        disabled={saving}
        className={cn(
          "rounded px-2 py-1 text-sm",
          available ? "bg-green-600 text-white" : "bg-muted text-foreground"
        )}
        title="Toggle availability"
      >
        {available ? "Available" : "Away"}
      </button>
    </div>
  );
}
