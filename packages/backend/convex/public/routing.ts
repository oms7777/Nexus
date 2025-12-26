// packages/backend/convex/public/routing.ts
import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

export type PublicRep = {
  userId: string;
  name?: string;
  avatarUrl?: string;
  role: "sales" | "support";
  regions: string[];
  available: boolean;
  title?: string;
};

export const listRepsForVisitor = query({
  args: {
    organizationId: v.string(),
    contactSessionId: v.optional(v.id("contactSessions")),
    countryCode: v.optional(v.string()),
    currentUrl: v.optional(v.string()),
    utmSource: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { organizationId, contactSessionId, countryCode, currentUrl, utmSource },
  ) => {
    try {
      if (!organizationId) return [] as PublicRep[];

      // 1) Metadata visiteur
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

      // 2) Extraire utm_source depuis l'URL
      if (visitorUrl && !visitorUtmSource) {
        try {
          const u = new URL(visitorUrl);
          visitorUtmSource = u.searchParams.get("utm_source") ?? undefined;
        } catch {
          // ignore
        }
      }

      // 3) Tous les reps sales de l'org (source of truth)
      const rawReps = await ctx.db
        .query("repsPresence")
        .withIndex("by_org_role", (q) =>
          q.eq("organizationId", organizationId).eq("role", "sales"),
        )
        .collect();

      // ✅ on filtre uniquement sur "available" (pas sur users table)
      const availableReps = rawReps.filter((r) => r.available);

      if (!availableReps.length) return [] as PublicRep[];

      // 4) Territories pour countryCode
      let visitorTerritoryKeys: string[] = [];
      if (visitorCountry) {
        const cc = visitorCountry.toUpperCase();
        const territories = (await ctx.db
          .query("territories")
          .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
          .collect()) as Doc<"territories">[];

        visitorTerritoryKeys = territories
          .filter((t) => (t.countryCodes ?? []).includes(cc))
          .map((t) => t.key);
      }

      // 5) Routing rules
      const rules = await ctx.db
        .query("routingRules")
        .withIndex("by_org_prio", (q) => q.eq("organizationId", organizationId))
        .collect();

      const ruleMatchesVisitor = (rule: Doc<"routingRules">): boolean => {
        const match = rule.match ?? {};
        const matchCountries: string[] | undefined = match.countries;
        const matchUrlIncludes: string[] | undefined = match.urlIncludes;
        const matchUtmSourceArr: string[] | undefined = match.utmSource;

        if (matchCountries && matchCountries.length) {
          if (!visitorCountry || !matchCountries.includes(visitorCountry)) return false;
        }

        if (matchUrlIncludes && matchUrlIncludes.length) {
          if (!visitorUrl) return false;
          const ok = matchUrlIncludes.some((sub: string) => visitorUrl.includes(sub));
          if (!ok) return false;
        }

        if (matchUtmSourceArr && matchUtmSourceArr.length) {
          if (!visitorUtmSource || !matchUtmSourceArr.includes(visitorUtmSource)) {
            return false;
          }
        }

        return true;
      };

      let matchedReps = availableReps;
      let ruleApplied = false;

      for (const rule of rules) {
        if (rule.enabled === false) continue;
        if (!ruleMatchesVisitor(rule as any)) continue;

        const rt = rule.routeTo;
        let subset = availableReps.filter((r) => r.role === rt.role);

        if (rt.repIds && rt.repIds.length) {
          subset = subset.filter((r) => rt.repIds!.includes(r.userId));
        }

        if (rt.regions && rt.regions.length) {
          subset = subset.filter((r) => {
            const repsRegions: string[] = r.regions ?? [];
            return repsRegions.some((reg) => rt.regions!.includes(reg));
          });
        }

        if (subset.length) {
          matchedReps = subset;
          ruleApplied = true;
          break;
        }
      }

      // fallback geo
      if (!ruleApplied && visitorTerritoryKeys.length > 0) {
        const geoFiltered = availableReps.filter((r) => {
          const repsRegions: string[] = r.regions ?? [];
          return repsRegions.some((reg) => visitorTerritoryKeys.includes(reg));
        });

        if (geoFiltered.length > 0) matchedReps = geoFiltered;
      }

      // 6) Enrichissement profil (best effort)
      const users = await ctx.db
        .query("users")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect();

      const byExternalId = new Map(users.map((u) => [u.externalId, u]));

      const result: PublicRep[] = matchedReps.map((rep) => {
        const u = byExternalId.get(rep.userId);

        return {
          userId: rep.userId,
          name: (u?.name as string | undefined) ?? undefined,
          avatarUrl: (u?.avatarUrl as string | undefined) ?? undefined,
          title: (u?.title as string | undefined) ?? undefined,
          role: rep.role,
          regions: rep.regions ?? [],
          available: rep.available,
        };
      });

      return result;
    } catch (e) {
      console.log("routing.listRepsForVisitor error:", e);
      return [] as PublicRep[];
    }
  },
});
