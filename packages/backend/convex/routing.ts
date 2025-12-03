import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

/**
 * Petit helper local: est-ce que la règle matche ce visiteur ?
 * (version simplifiée: pays + urlIncludes)
 */
function ruleMatches(
  rule: Doc<"routingRules">,
  ctx: { countryCode?: string; currentUrl?: string },
): boolean {
  const m = rule.match ?? {};

  // pays
  if (m.countries && m.countries.length > 0) {
    if (!ctx.countryCode || !m.countries.includes(ctx.countryCode)) {
      return false;
    }
  }

  // URL substring
  if (m.urlIncludes && m.urlIncludes.length > 0) {
    if (!ctx.currentUrl) return false;
    const ok = m.urlIncludes.some((sub: string) =>
      ctx.currentUrl!.toLowerCase().includes(sub.toLowerCase()),
    );
    if (!ok) return false;
  }

  return true;
}

/** Helper safe pour éviter le "possibly undefined" TypeScript */
function pickRandom<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx] ?? null;
}

/**
 * Calcule la liste des territory.key qui couvrent un countryCode donné.
 */
async function resolveTerritoryKeysForCountry(
  ctx: any,
  organizationId: string,
  countryCode?: string,
): Promise<string[]> {
  if (!countryCode) return [];
  const cc = countryCode.toUpperCase();

  const territories = (await ctx.db
    .query("territories")
    .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
    .collect()) as Doc<"territories">[];

  return territories
    .filter((t) => (t.countryCodes ?? []).includes(cc))
    .map((t) => t.key);
}

/**
 * Choisit UN rep pour une session donnée.
 * Retourne son userId (Clerk) ou null.
 */
export const pickRepForSession = query({
  args: {
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
  },
  handler: async (ctx, { organizationId, contactSessionId }) => {
    // 1) récupérer la session
    const session = await ctx.db.get(contactSessionId);
    if (!session) return null;
    if (session.organizationId !== organizationId) return null;

    const matchCtx = {
      countryCode: session.metadata?.countryCode as string | undefined,
      currentUrl: session.metadata?.currentUrl as string | undefined,
    };

    // 2) récupérer tous les reps de l’org
    const allReps = (await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect()) as Doc<"repsPresence">[];

    if (!allReps.length) return null;

    // 2bis) Si le visiteur a explicitement choisi un rep côté widget
    const preferredRepUserId =
      session.metadata?.preferredRepUserId as string | undefined;

    if (preferredRepUserId) {
      const preferred = allReps.find((r) => r.userId === preferredRepUserId);
      if (preferred && preferred.available) {
        return preferred.userId;
      }
    }

    // 3) routingRules par priorité (override "entreprise")
    const rules = await ctx.db
      .query("routingRules")
      .withIndex("by_org_prio", (q) => q.eq("organizationId", organizationId))
      .order("asc")
      .take(100);

    for (const rule of rules) {
      if (rule.enabled === false) continue;
      if (!ruleMatches(rule as Doc<"routingRules">, matchCtx)) continue;

      const target = rule.routeTo;

      // candidats: reps dispo + bon rôle
      let candidates = allReps.filter(
        (r) => r.available && r.role === target.role,
      );

      // filtre repIds si défini
      if (target.repIds && target.repIds.length > 0) {
        candidates = candidates.filter((r) =>
          target.repIds!.includes(r.userId),
        );
      }

      // filtre regions si défini (ici ce sont des territory.key)
      if (target.regions && target.regions.length > 0) {
        candidates = candidates.filter((r) => {
          const repRegions = r.regions ?? [];
          return target.regions!.some((reg) => repRegions.includes(reg));
        });
      }

      const chosen = pickRandom(candidates);
      if (chosen) {
        return chosen.userId;
      }
    }

    // 4) Fallback intelligent territories: countryCode → territories → reps
    if (matchCtx.countryCode) {
      const territoryKeys = await resolveTerritoryKeysForCountry(
        ctx,
        organizationId,
        matchCtx.countryCode,
      );

      if (territoryKeys.length > 0) {
        const geoCandidates = allReps.filter((r) => {
          if (!r.available || r.role !== "sales") return false;
          const repRegions = r.regions ?? [];
          return repRegions.some((reg) => territoryKeys.includes(reg));
        });

        const chosen = pickRandom(geoCandidates);
        if (chosen) return chosen.userId;
      }
    }

    // 5) fallback : n'importe quel sales dispo
    const sales = allReps.filter((r) => r.available && r.role === "sales");
    if (sales.length) {
      const chosen = pickRandom(sales);
      if (chosen) return chosen.userId;
    }

    // 6) dernier fallback : n'importe quel rep dispo
    const available = allReps.filter((r) => r.available);
    if (available.length) {
      const chosen = pickRandom(available);
      if (chosen) return chosen.userId;
    }

    return null;
  },
});
