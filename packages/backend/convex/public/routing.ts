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
  handler: async (
    ctx,
    { organizationId, contactSessionId, countryCode, currentUrl, utmSource },
  ) => {
    try {
      if (!organizationId) return [] as PublicRep[];

      // ✅ 0) ROUTING MODE GATE (SOURCE OF TRUTH)
      const settings = await ctx.db
        .query("widgetSettings")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
        .unique();

      const routingMode = (settings?.routingMode ?? "auto_assign") as
        | "auto_assign"
        | "visitor_choice";

      // ✅ If auto_assign => NEVER expose rep choices to widget
      if (routingMode !== "visitor_choice") {
        return [] as PublicRep[];
      }

      // 1) Resolve visitor context (session overrides)
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
          if (!visitorUtmSource && typeof (md as any).utmSource === "string")
            visitorUtmSource = (md as any).utmSource;
        }
      }

      if (!visitorUtmSource) visitorUtmSource = extractUtmSourceFromUrl(visitorUrl);

      // 2) Load reps (sales only for visitor choice)
      const rawReps = await ctx.db
        .query("repsPresence")
        .withIndex("by_org_role", (q) =>
          q.eq("organizationId", organizationId).eq("role", "sales"),
        )
        .collect();

      const availableReps = rawReps.filter((r) => r.available);
      if (!availableReps.length) return [] as PublicRep[];

      // 3) Territories mapping for country
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

      // 4) Apply routing rules to filter list (still OK in visitor_choice)
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

        if (rt.repIds && rt.repIds.length)
          subset = subset.filter((r) => rt.repIds!.includes(r.userId));

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

      // 5) Join profiles (users)
      const users = await ctx.db
        .query("users")
        .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
        .collect();

      const byExternalId = new Map<string, any>();
      for (const u of users) byExternalId.set(u.externalId, u);

      return matchedReps.map((rep) => {
        const u = byExternalId.get(rep.userId);
        const avatar =
          typeof u?.avatarUrl === "string" && u.avatarUrl.trim()
            ? u.avatarUrl.trim()
            : undefined;

        return {
          userId: rep.userId,
          name: (u?.name as string | undefined) ?? undefined,
          avatarUrl: avatar,
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
export const listCandidatesForAutoAssign = query({
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

      // 1) Resolve visitor context (session overrides)
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
          if (!visitorUtmSource && typeof (md as any).utmSource === "string")
            visitorUtmSource = (md as any).utmSource;
        }
      }

      if (!visitorUtmSource) visitorUtmSource = extractUtmSourceFromUrl(visitorUrl);

      // 2) Load reps (sales only)
      const rawReps = await ctx.db
        .query("repsPresence")
        .withIndex("by_org_role", (q) =>
          q.eq("organizationId", organizationId).eq("role", "sales"),
        )
        .collect();

      const availableReps = rawReps.filter((r) => r.available);
      if (!availableReps.length) return [] as PublicRep[];

      // 3) Territories mapping for country
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

      // 4) Apply routing rules to filter list
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

        if (rt.repIds && rt.repIds.length)
          subset = subset.filter((r) => rt.repIds!.includes(r.userId));

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

      // 5) Join profiles (users)
      const users = await ctx.db
        .query("users")
        .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
        .collect();

      const byExternalId = new Map<string, any>();
      for (const u of users) byExternalId.set(u.externalId, u);

      return matchedReps.map((rep) => {
        const u = byExternalId.get(rep.userId);
        const avatar =
          typeof u?.avatarUrl === "string" && u.avatarUrl.trim()
            ? u.avatarUrl.trim()
            : undefined;

        return {
          userId: rep.userId,
          name: (u?.name as string | undefined) ?? undefined,
          avatarUrl: avatar,
          title: (u?.title as string | undefined) ?? undefined,
          role: rep.role,
          regions: rep.regions ?? [],
          available: rep.available,
        };
      });
    } catch (e) {
      console.log("routing.listCandidatesForAutoAssign error:", e);
      return [] as PublicRep[];
    }
  },
});


export const pickRepForVisitor = query({
  args: {
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
  },
  handler: async (ctx, { organizationId, contactSessionId }) => {
    const session = await ctx.db.get(contactSessionId);
    if (!session) return null;
    if (session.organizationId !== organizationId) return null;
    if (session.expiresAt && session.expiresAt < Date.now()) return null;

    // 🔥 IMPORTANT: auto_assign doit retourner UN rep, visitor_choice peut aussi
    const reps = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_role", (q) =>
        q.eq("organizationId", organizationId).eq("role", "sales"),
      )
      .collect();

    const available = reps.filter((r) => r.available);
    if (!available.length) return null;

    // 1) Si le visitor a déjà choisi un rep
    const preferred = session.metadata?.preferredRepUserId as string | undefined;
    if (preferred) {
      const found = available.find((r) => r.userId === preferred);
      if (found) {
        const u = await ctx.db
          .query("users")
          .withIndex("by_org_external", (q: any) =>
            q.eq("organizationId", organizationId).eq("externalId", found.userId),
          )
          .unique();

        const avatar =
          typeof u?.avatarUrl === "string" && u.avatarUrl.trim()
            ? u.avatarUrl.trim()
            : undefined;

        return {
          userId: found.userId,
          name: u?.name ?? undefined,
          avatarUrl: avatar,
          title: u?.title ?? undefined,
          role: found.role,
          regions: found.regions ?? [],
          available: found.available,
        } as PublicRep;
      }
    }

    // 2) Sinon: pick random parmi les sales disponibles
    const chosen = available[Math.floor(Math.random() * available.length)];
    if (!chosen) return null;

    const u = await ctx.db
      .query("users")
      .withIndex("by_org_external", (q: any) =>
        q.eq("organizationId", organizationId).eq("externalId", chosen.userId),
      )
      .unique();

    const avatar =
      typeof u?.avatarUrl === "string" && u.avatarUrl.trim()
        ? u.avatarUrl.trim()
        : undefined;

    return {
      userId: chosen.userId,
      name: u?.name ?? undefined,
      avatarUrl: avatar,
      title: u?.title ?? undefined,
      role: chosen.role,
      regions: chosen.regions ?? [],
      available: chosen.available,
    } as PublicRep;
  },
});

