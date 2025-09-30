// apps/web/components/PresenceToggle.tsx
"use client";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useState, useEffect } from "react";

// --- DÉCLARATION DU TYPE TEMPORAIRE ---
type RepRole = "sales" | "support";

interface RepMeResult {
  userId: string;
  available: boolean;
  role: RepRole;
  regions: string[];
  // Ajoutez d'autres champs si 'me' retourne plus de données
}
// ----------------------------------------

export default function PresenceToggle() {
  // Cast du résultat de la requête au type temporaire pour résoudre l'erreur 'never'
  const me = useQuery(api.private.reps.me, {}) as RepMeResult | undefined;
  const setAvailability = useMutation(api.private.reps.setAvailability);

  // Utilisez le type RepRole que nous avons défini
  const [available, setAvailable] = useState(false);
  const [role, setRole] = useState<RepRole>("sales");

  useEffect(() => {
    if (me) {
      // Les erreurs de type 'available' et 'role' sont corrigées ici.
      setAvailable(me.available);
      setRole(me.role || "sales"); 
      // Note: On peut enlever le `as any` car on utilise le type RepRole
    }
  }, [me]);

  return (
    <div className="flex items-center gap-2">
      <select
        className="border rounded px-2 py-1 text-sm"
        value={role}
        onChange={e => setRole(e.target.value as RepRole)} // Cast ici
      >
        <option value="sales">Sales</option>
        <option value="support">Support</option>
      </select>

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={available}
          onChange={async (e) => {
            const next = e.target.checked;
            setAvailable(next);
            await setAvailability({ role, available: next, regions: ["FR","EMEA"] });
          }}
        />
        {available ? "Available" : "Away"}
      </label>
    </div>
  );
}