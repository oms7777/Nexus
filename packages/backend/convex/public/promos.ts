// packages/backend/convex/public/promos.ts
import { query } from "../_generated/server";
import { v } from "convex/values";

type Rules = {
  pathPrefix?: string;
  urlIncludes?: string[];
  utmSource?: string[];
};

/* -------------------- Normalisation -------------------- */

function normalizeRules(rules?: Rules | null): Rules | undefined {
  if (!rules) return undefined;

  const pathPrefix = rules.pathPrefix?.trim() || undefined;

  const urlIncludes =
    rules.urlIncludes?.map((s) => s.trim()).filter(Boolean) || undefined;

  const utmSource =
    rules.utmSource?.map((s) => s.trim()).filter(Boolean) || undefined;

  if (!pathPrefix && !urlIncludes && !utmSource) return undefined;

  return { pathPrefix, urlIncludes, utmSource };
}

/* -------------------- Matching -------------------- */

function matches(url: string, utm: string | undefined, rawRules?: Rules) {
  const rules = normalizeRules(rawRules);
  if (!rules) return true;

  try {
    const u = new URL(url);

    // 1) Path prefix
    if (rules.pathPrefix && !u.pathname.startsWith(rules.pathPrefix)) {
      return false;
    }

    // 2) URL includes
    if (rules.urlIncludes?.length) {
      const hit = rules.urlIncludes.some(
        (s) => u.pathname.includes(s) || u.search.includes(s),
      );
      if (!hit) return false;
    }

    // 3) utmSource
    if (rules.utmSource?.length) {
      if (!utm || !rules.utmSource.includes(utm)) return false;
    }

    return true;
  } catch (err) {
    console.error("promos.matches – invalid URL", url, err);
    return false;
  }
}

/* -------------------- Specificity ranking -------------------- */
// But : la promo la plus précise gagne
// Exemple : "/pricing/team" > "/pricing" > "/"

function ruleSpecificity(rawRules?: Rules | null): number {
  const rules = normalizeRules(rawRules);
  if (!rules) return 0;

  let score = 0;

  // Longueur du pathPrefix = signal principal
  if (rules.pathPrefix) score += rules.pathPrefix.length * 10;

  // Includes = bonus
  if (rules.urlIncludes?.length) score += rules.urlIncludes.length * 5;

  // UTM = bonus léger
  if (rules.utmSource?.length) score += rules.utmSource.length * 3;

  return score;
}

/* -------------------- Query principale -------------------- */

export const listForPage = query({
  args: {
    organizationId: v.optional(v.string()),
    currentUrl: v.optional(v.string()),
    utmSource: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, currentUrl, utmSource }) => {
    try {
      if (!organizationId || !currentUrl) return [];

      const all = await ctx.db
        .query("promos")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect();

      const active = all.filter((p) => p.active);

      const matched = active.filter((p) =>
        matches(currentUrl, utmSource, p.rules as Rules),
      );

      // 👉 Tri automatique : plus spécifique en premier
      matched.sort(
        (a, b) =>
          ruleSpecificity(b.rules as Rules) - ruleSpecificity(a.rules as Rules),
      );

      console.log("promos:listForPage", {
        org: organizationId,
        currentUrl,
        matched: matched.length,
        chosen: matched[0]?._id,
      });

      return matched;
    } catch (err) {
      console.error("promos:listForPage failed", err);
      return [];
    }
  },
});
