// packages/backend/convex/routing.ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

/**
 * Petit helper local: est-ce que la règle matche ce visiteur ?
 * (pays + urlIncludes + utmSource)
 */
function ruleMatches(
  rule: Doc<"routingRules">,
  ctx: { countryCode?: string; currentUrl?: string; utmSource?: string },
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
    const url = ctx.currentUrl.toLowerCase();
    const ok = m.urlIncludes.some((sub: string) => url.includes(sub.toLowerCase()));
    if (!ok) return false;
  }

  // utm_source
  if (m.utmSource && m.utmSource.length > 0) {
    if (!ctx.utmSource || !m.utmSource.includes(ctx.utmSource)) {
      return false;
    }
  }

  return true;
}

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

function extractUtmSourceFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const v = u.searchParams.get("utm_source");
    return v ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Choisit UN rep pour une session donnée.
 * Retourne son userId (Clerk) ou null.
 *
 * ✅ IMPORTANT:
 * - rep = document repsPresence
 * - users = profil (avatar/title) -> ne doit PAS impacter le routing
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

    const currentUrl = session.metadata?.currentUrl as string | undefined;

    const matchCtx = {
      countryCode: session.metadata?.countryCode as string | undefined,
      currentUrl,
      utmSource:
        (session.metadata?.utmSource as string | undefined) ??
        extractUtmSourceFromUrl(currentUrl),
    };

    // 2) récupérer tous les reps de l’org (source of truth)
    const reps = (await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect()) as Doc<"repsPresence">[];

    if (!reps.length) return null;

    // 3) Si le visiteur a explicitement choisi un rep côté widget
    const preferredRepUserId = session.metadata?.preferredRepUserId as string | undefined;

    if (preferredRepUserId) {
      const preferred = reps.find((r) => r.userId === preferredRepUserId);
      // ✅ MAJ: on exige dispo + role sales (tu peux enlever role si tu veux support aussi)
      if (preferred && preferred.available && preferred.role === "sales") {
        return preferred.userId;
      }
    }

    // 4) routingRules par priorité (override "entreprise")
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
      let candidates = reps.filter((r) => r.available && r.role === target.role);

      // filtre repIds si défini
      if (target.repIds && target.repIds.length > 0) {
        candidates = candidates.filter((r) => target.repIds!.includes(r.userId));
      }

      // filtre regions si défini (ici ce sont des territory.key)
      if (target.regions && target.regions.length > 0) {
        candidates = candidates.filter((r) => {
          const repRegions = r.regions ?? [];
          return target.regions!.some((reg) => repRegions.includes(reg));
        });
      }

      const chosen = pickRandom(candidates);
      if (chosen) return chosen.userId;
    }

    // 5) Fallback intelligent territories: countryCode → territories → reps
    if (matchCtx.countryCode) {
      const territoryKeys = await resolveTerritoryKeysForCountry(
        ctx,
        organizationId,
        matchCtx.countryCode,
      );

      if (territoryKeys.length > 0) {
        const geoCandidates = reps.filter((r) => {
          if (!r.available || r.role !== "sales") return false;
          const repRegions = r.regions ?? [];
          return repRegions.some((reg) => territoryKeys.includes(reg));
        });

        const chosen = pickRandom(geoCandidates);
        if (chosen) return chosen.userId;
      }
    }

    // 6) fallback : n'importe quel sales dispo
    const sales = reps.filter((r) => r.available && r.role === "sales");
    if (sales.length) return pickRandom(sales)!.userId;

    // 7) dernier fallback : n'importe quel rep dispo
    const available = reps.filter((r) => r.available);
    if (available.length) return pickRandom(available)!.userId;

    return null;
  },
});
