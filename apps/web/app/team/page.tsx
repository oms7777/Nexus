// apps/web/app/team/page.tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useUser, useOrganization } from "@clerk/nextjs";
// Importez le type de Convex ici (il est dans le backend)
// Nous allons utiliser un type générique en attendant, mais idéalement vous importeriez le type Rep de la base de données.

// Définition de type simple pour le Rep (temporaire ou basée sur votre schéma)
interface Rep {
  _id: string; // Nécessaire pour la clé
  userId: string;
  regions: string[];
  available: boolean;
  role: "sales" | "support";
  // ... autres champs si besoin
}


export default function TeamPage() {
  const { isLoaded, membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";
  const reps = useQuery(api.private.reps.list, {}) as Rep[] | undefined; // <-- Cast ici
  const setRoleForUser = useMutation(api.private.reps.setRoleForUser);

  if (!isLoaded) return null;
  if (!isAdmin) return <div className="p-4 text-sm">Admins only</div>;

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-semibold">Team</h1>
      <div className="space-y-2">
        {(reps ?? []).map(rep => (
          <div key={rep._id} className="flex items-center gap-3 rounded border p-2">
            <div className="flex-1">
              <div className="font-medium">{rep.userId}</div>
              <div className="text-xs text-muted-foreground">
                {rep.regions?.join(", ") || "—"} · {rep.available ? "Available" : "Away"}
              </div>
            </div>
            <select
              className="rounded border bg-transparent px-2 py-1 text-sm"
              value={rep.role}
              onChange={async (e) => {
                await setRoleForUser({
                  userId: rep.userId,
                  role: e.target.value as "sales" | "support",
                });
              }}
            >
              <option value="sales">Sales</option>
              <option value="support">Support</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}