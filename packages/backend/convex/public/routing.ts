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

export const listRepsForVisitor = query({
  args: {
    organizationId: v.string(),
    contactSessionId: v.optional(v.id("contactSessions")),
    countryCode: v.optional(v.string()),
    currentUrl: v.optional(v.string()),
    utmSource: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, contactSessionId, countryCode, currentUrl, utmSource }) => {
    try {
      if (!organizationId) return [] as PublicRep[];

      let visitorCountry: string | undefined = countryCode;
      let visitorUrl: string | undefined = currentUrl;
      let visitorUtmSource: string | undefined = utmSource;

      if (contactSessionId) {
        const session = await ctx.db.get(contactSessionId);
        if (session && session.organizationId === organizationId) {
          if (session.expiresAt && session.expiresAt < Date.now()) return [] as PublicRep[];

          const md = session.metadata ?? {};
          if (!visitorCountry && typeof md.countryCode === "string") visitorCountry = md.countryCode;
          if (!visitorUrl && typeof md.currentUrl === "string") visitorUrl = md.currentUrl;
          if (!visitorUtmSource && typeof (md as any).utmSource === "string") visitorUtmSource = (md as any).utmSource;
        }
      }

      if (!visitorUtmSource) visitorUtmSource = extractUtmSourceFromUrl(visitorUrl);

      const rawReps = await ctx.db
        .query("repsPresence")
        .withIndex("by_org_role", (q) => q.eq("organizationId", organizationId).eq("role", "sales"))
        .collect();

      const availableReps = rawReps.filter((r) => r.available);
      if (!availableReps.length) return [] as PublicRep[];

      // territories for visitor country
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

      // routing rules priority
      const rules = await ctx.db
        .query("routingRules")
        .withIndex("by_org_prio", (q) => q.eq("organizationId", organizationId))
        .order("asc")
        .take(100);

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
          const url = visitorUrl.toLowerCase();
          const ok = matchUrlIncludes.some((sub: string) => url.includes(sub.toLowerCase()));
          if (!ok) return false;
        }
        if (matchUtmSourceArr && matchUtmSourceArr.length) {
          if (!visitorUtmSource || !matchUtmSourceArr.includes(visitorUtmSource)) return false;
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

        if (rt.repIds && rt.repIds.length) subset = subset.filter((r) => rt.repIds!.includes(r.userId));
        if (rt.regions && rt.regions.length) {
          subset = subset.filter((r) => {
            const repRegions: string[] = r.regions ?? [];
            return repRegions.some((reg) => rt.regions!.includes(reg));
          });
        }

        if (subset.length) {
          matchedReps = subset;
          ruleApplied = true;
          break;
        }
      }

      if (!ruleApplied && visitorTerritoryKeys.length > 0) {
        const geoFiltered = availableReps.filter((r) => {
          const repRegions: string[] = r.regions ?? [];
          return repRegions.some((reg) => visitorTerritoryKeys.includes(reg));
        });
        if (geoFiltered.length > 0) matchedReps = geoFiltered;
      }

      // ✅ Enrich profiles per rep (small N)
      const profileByUserId = new Map<string, any>();
      for (const rep of matchedReps) {
        const u = await ctx.db
          .query("users")
          .withIndex("by_org_external", (q: any) =>
            q.eq("organizationId", organizationId).eq("externalId", rep.userId),
          )
          .unique();

        if (u) profileByUserId.set(rep.userId, u);
      }

      return matchedReps.map((rep) => {
        const u = profileByUserId.get(rep.userId);
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
    } catch (e) {
      console.log("routing.listRepsForVisitor error:", e);
      return [] as PublicRep[];
    }
  },
});
