// packages/backend/convex/public/routing.ts
import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Type retourné côté widget pour afficher la liste des reps sélectionnables.
 */
export type PublicRep = {
  userId: string;
  name?: string;
  avatarUrl?: string;
  role: "sales" | "support";
  regions: string[];
  available: boolean;
};

/**
 * Liste les reps "éligibles" pour un visiteur en appliquant:
 * - les routingRules (priorité)
 * - la presence (only available)
 * - la géo et l'URL de la session (contactSessions.metadata)
 *
 * Le widget pourra ensuite afficher:
 *  - la photo / nom du rep
 *  - et appeler listSlots/bookSlot avec userId de ce rep
 */
export const listRepsForVisitor = query({
  args: {
    organizationId: v.string(),
    contactSessionId: v.optional(v.id("contactSessions")),
    // Permet d'override (ex: si on a déjà la country côté widget)
    countryCode: v.optional(v.string()),
    currentUrl: v.optional(v.string()),
    // au cas où le widget l’envoie directement
    utmSource: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { organizationId, contactSessionId, countryCode, currentUrl, utmSource }
  ) => {
    try {
      if (!organizationId) return [] as PublicRep[];

      // 1) Récupérer metadata visiteur (GEO + URL) si session fournie
      let visitorCountry: string | undefined = countryCode;
      let visitorUrl: string | undefined = currentUrl;
      let visitorUtmSource: string | undefined = utmSource;

      if (contactSessionId) {
        const session = await ctx.db.get(contactSessionId);
        if (session && session.organizationId === organizationId) {
          const md = session.metadata ?? {};
          if (!visitorCountry && typeof md.countryCode === "string") {
            visitorCountry = md.countryCode;
          }
          if (!visitorUrl && typeof md.currentUrl === "string") {
            visitorUrl = md.currentUrl;
          }
        }
      }

      // 2) Extraire utm_source depuis l'URL (si présente et pas déjà fournie)
      if (visitorUrl && !visitorUtmSource) {
        try {
          const u = new URL(visitorUrl);
          visitorUtmSource = u.searchParams.get("utm_source") ?? undefined;
        } catch {
          // URL mal formée → on ignore
        }
      }

      // 3) Tous les reps "sales" disponibles pour cette org
      const reps = await ctx.db
        .query("repsPresence")
        .withIndex("by_org_role", (q) =>
          q.eq("organizationId", organizationId).eq("role", "sales")
        )
        .collect();

      const availableReps = reps.filter((r) => r.available);
      if (!availableReps.length) {
        // Aucun rep dispo -> on retourne [] (le widget gèrera le fallback)
        return [] as PublicRep[];
      }

      // 4) Charger les routingRules par org + priorité
      const rules = await ctx.db
        .query("routingRules")
        .withIndex("by_org_prio", (q) => q.eq("organizationId", organizationId))
        .collect();

      // 5) Helper pour savoir si une rule matche ce visiteur
      const ruleMatchesVisitor = (rule: any): boolean => {
        const match = rule.match ?? {};
        const matchCountries: string[] | undefined = match.countries;
        const matchUrlIncludes: string[] | undefined = match.urlIncludes;
        const matchUtmSource: string[] | undefined = match.utmSource;

        // pays
        if (matchCountries && matchCountries.length) {
          if (!visitorCountry || !matchCountries.includes(visitorCountry)) {
            return false;
          }
        }

        // URL substring
        if (matchUrlIncludes && matchUrlIncludes.length) {
          if (!visitorUrl) return false;
          const ok = matchUrlIncludes.some((sub: string) =>
            visitorUrl.includes(sub)
          );
          if (!ok) return false;
        }

        // utm_source
        if (matchUtmSource && matchUtmSource.length) {
          if (!visitorUtmSource || !matchUtmSource.includes(visitorUtmSource)) {
            return false;
          }
        }

        return true;
      };

      // 6) Appliquer les règles dans l'ordre de priorité (index by_org_prio)
      let matchedReps = availableReps;

      for (const rule of rules) {
        if (rule.enabled === false) continue;
        if (!ruleMatchesVisitor(rule)) continue;

        const rt = rule.routeTo;
        let subset = availableReps.filter((r) => r.role === rt.role);

        // Filtre par repIds explicites
        if (rt.repIds && rt.repIds.length) {
          subset = subset.filter((r) => rt.repIds!.includes(r.userId));
        }

        // Filtre par régions si défini
        if (rt.regions && rt.regions.length) {
          subset = subset.filter((r) => {
            const repsRegions: string[] = r.regions ?? [];
            return repsRegions.some((reg) => rt.regions!.includes(reg));
          });
        }

        if (subset.length) {
          matchedReps = subset;
          break; // on s'arrête à la première règle qui produit au moins 1 rep
        }
      }

      // 7) Joindre avec la table users pour récupérer name + avatar
      const users = await ctx.db
        .query("users")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect();
      const byExternalId = new Map(users.map((u) => [u.externalId, u]));

      const result: PublicRep[] = matchedReps.map((rep) => {
        const u = byExternalId.get(rep.userId);
        return {
          userId: rep.userId,
          name: u?.name ?? undefined,
          avatarUrl: u?.avatarUrl ?? undefined,
          role: rep.role,
          regions: rep.regions ?? [],
          available: rep.available,
        };
      });

      return result;
    } catch (e) {
      // On ne casse jamais le widget : en cas de bug, on renvoie juste []
      console.log("routing.listRepsForVisitor error:", e);
      return [] as PublicRep[];
    }
  },
});
