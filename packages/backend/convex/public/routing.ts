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

function normalizeCountryCode(cc?: string): string | undefined {
  if (!cc) return undefined;
  const x = cc.trim();
  if (!x) return undefined;
  return x.toUpperCase();
}

function pickRandom<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx] ?? null;
}

/**
 * listRepsForVisitor:
 * ✅ Gate routingMode = visitor_choice
 * ✅ V1 territory-only: on retourne des reps disponibles (tous rôles),
 *    filtrés éventuellement par rules/territories, puis enrichis users.
 */
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
  ): Promise<PublicRep[]> => {
    try {
      if (!organizationId) return [];

      // ✅ 0) ROUTING MODE GATE (SOURCE OF TRUTH)
      const settings = await ctx.db
        .query("widgetSettings")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
        .unique();

      const routingMode = (settings?.routingMode ?? "auto_assign") as
        | "auto_assign"
        | "visitor_choice";

      // ✅ If auto_assign => NEVER expose rep choices to widget
      if (routingMode !== "visitor_choice") return [];

      // 1) Resolve visitor context (session overrides)
      let visitorCountry: string | undefined = countryCode;
      let visitorUrl: string | undefined = currentUrl;
      let visitorUtmSource: string | undefined = utmSource;

      if (contactSessionId) {
        const session = await ctx.db.get(contactSessionId);
        if (session && session.organizationId === organizationId) {
          if (session.expiresAt && session.expiresAt < Date.now()) return [];
          const md = session.metadata ?? {};
          if (!visitorCountry && typeof md.countryCode === "string") visitorCountry = md.countryCode;
          if (!visitorUrl && typeof md.currentUrl === "string") visitorUrl = md.currentUrl;
          if (!visitorUtmSource && typeof (md as any).utmSource === "string")
            visitorUtmSource = (md as any).utmSource;
        }
      }

      visitorCountry = normalizeCountryCode(visitorCountry);
      if (!visitorUtmSource) visitorUtmSource = extractUtmSourceFromUrl(visitorUrl);

      // 2) Load reps (✅ V1 territory-only: ALL roles)
      const rawReps = await ctx.db
        .query("repsPresence")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect();

      const availableReps = rawReps.filter((r) => r.available);
      if (!availableReps.length) return [];

      // 3) Territories mapping for country
      let visitorTerritoryKeys: string[] = [];
      if (visitorCountry) {
        const territories = (await ctx.db
          .query("territories")
          .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
          .collect()) as Doc<"territories">[];

        visitorTerritoryKeys = territories
          .filter((t) => (t.countryCodes ?? []).includes(visitorCountry!))
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
          const normalizedRuleCountries = matchCountries
            .map((c) => normalizeCountryCode(c))
            .filter(Boolean) as string[];

          if (!visitorCountry || !normalizedRuleCountries.includes(visitorCountry)) return false;
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

        // ✅ V1 territory-only: subset starts from availableReps (ignore rt.role)
        let subset = availableReps;

        if (rt.repIds && rt.repIds.length) {
          subset = subset.filter((r) => rt.repIds!.includes(r.userId));
        }

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

      // Territory fallback if no rule applied
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
          typeof u?.avatarUrl === "string" && u.avatarUrl.trim() ? u.avatarUrl.trim() : undefined;

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
      return [];
    }
  },
});

/**
 * listCandidatesForAutoAssign:
 * ✅ V1 territory-only: même logique que listRepsForVisitor,
 *    mais appelé en auto_assign (pas de gate routingMode ici).
 */
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
  ): Promise<PublicRep[]> => {
    try {
      if (!organizationId) return [];

      // 1) Resolve visitor context (session overrides)
      let visitorCountry: string | undefined = countryCode;
      let visitorUrl: string | undefined = currentUrl;
      let visitorUtmSource: string | undefined = utmSource;

      if (contactSessionId) {
        const session = await ctx.db.get(contactSessionId);
        if (session && session.organizationId === organizationId) {
          if (session.expiresAt && session.expiresAt < Date.now()) return [];
          const md = session.metadata ?? {};
          if (!visitorCountry && typeof md.countryCode === "string") visitorCountry = md.countryCode;
          if (!visitorUrl && typeof md.currentUrl === "string") visitorUrl = md.currentUrl;
          if (!visitorUtmSource && typeof (md as any).utmSource === "string")
            visitorUtmSource = (md as any).utmSource;
        }
      }

      visitorCountry = normalizeCountryCode(visitorCountry);
      if (!visitorUtmSource) visitorUtmSource = extractUtmSourceFromUrl(visitorUrl);

      // 2) Load reps (✅ V1 territory-only: ALL roles)
      const rawReps = await ctx.db
        .query("repsPresence")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect();

      const availableReps = rawReps.filter((r) => r.available);
      if (!availableReps.length) return [];

      // 3) Territories mapping for country
      let visitorTerritoryKeys: string[] = [];
      if (visitorCountry) {
        const territories = (await ctx.db
          .query("territories")
          .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
          .collect()) as Doc<"territories">[];

        visitorTerritoryKeys = territories
          .filter((t) => (t.countryCodes ?? []).includes(visitorCountry!))
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
          const normalizedRuleCountries = matchCountries
            .map((c) => normalizeCountryCode(c))
            .filter(Boolean) as string[];

          if (!visitorCountry || !normalizedRuleCountries.includes(visitorCountry)) return false;
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

        // ✅ V1 territory-only: ignore rt.role
        let subset = availableReps;

        if (rt.repIds && rt.repIds.length) {
          subset = subset.filter((r) => rt.repIds!.includes(r.userId));
        }

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
          typeof u?.avatarUrl === "string" && u.avatarUrl.trim() ? u.avatarUrl.trim() : undefined;

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
      return [];
    }
  },
});

/**
 * pickRepForVisitor:
 * ✅ V1 territory-only: ignore roles in routing decisions.
 */
export const pickRepForVisitor = query({
  args: {
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
  },
  handler: async (ctx, { organizationId, contactSessionId }): Promise<PublicRep | null> => {
    const session = await ctx.db.get(contactSessionId);
    if (!session) return null;
    if (session.organizationId !== organizationId) return null;
    if (session.expiresAt && session.expiresAt < Date.now()) return null;

    const currentUrl = session.metadata?.currentUrl as string | undefined;
    const matchCountry = normalizeCountryCode(session.metadata?.countryCode as string | undefined);
    const matchUtm =
      (session.metadata?.utmSource as string | undefined) ?? extractUtmSourceFromUrl(currentUrl);

    // reps (source of truth)
    const reps = (await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect()) as Doc<"repsPresence">[];

    const availableReps = reps.filter((r) => r.available);
    if (!availableReps.length) return null;

    // 1) preferred rep (visitor_choice)
    const preferred = session.metadata?.preferredRepUserId as string | undefined;
    if (preferred) {
      const foundPref = availableReps.find((r) => r.userId === preferred);
      if (foundPref) {
        const u = await ctx.db
          .query("users")
          .withIndex("by_org_external", (q: any) =>
            q.eq("organizationId", organizationId).eq("externalId", foundPref.userId),
          )
          .unique();

        const avatar =
          typeof u?.avatarUrl === "string" && u.avatarUrl.trim() ? u.avatarUrl.trim() : undefined;

        return {
          userId: foundPref.userId,
          name: u?.name ?? undefined,
          avatarUrl: avatar,
          title: u?.title ?? undefined,
          role: foundPref.role,
          regions: foundPref.regions ?? [],
          available: foundPref.available,
        };
      }
    }

    // 2) Apply routingRules by priority
    const rules = (await ctx.db
      .query("routingRules")
      .withIndex("by_org_prio", (q) => q.eq("organizationId", organizationId))
      .order("asc")
      .take(100)) as Doc<"routingRules">[];

    const ruleMatches = (rule: Doc<"routingRules">): boolean => {
      const m = rule.match ?? {};

      if (m.countries && m.countries.length > 0) {
        const normalized = m.countries
          .map((c) => normalizeCountryCode(c))
          .filter(Boolean) as string[];
        if (!matchCountry || !normalized.includes(matchCountry)) return false;
      }

      if (m.urlIncludes && m.urlIncludes.length > 0) {
        if (!currentUrl) return false;
        const url = currentUrl.toLowerCase();
        const ok = m.urlIncludes.some((sub: string) => url.includes(sub.toLowerCase()));
        if (!ok) return false;
      }

      if (m.utmSource && m.utmSource.length > 0) {
        if (!matchUtm || !m.utmSource.includes(matchUtm)) return false;
      }

      return true;
    };

    for (const rule of rules) {
      if (rule.enabled === false) continue;
      if (!ruleMatches(rule)) continue;

      const target = rule.routeTo;

      // ✅ V1 territory-only: candidates = available only (ignore target.role)
      let candidates = reps.filter((r) => r.available);

      if (target.repIds && target.repIds.length > 0) {
        candidates = candidates.filter((r) => target.repIds!.includes(r.userId));
      }

      if (target.regions && target.regions.length > 0) {
        candidates = candidates.filter((r) => {
          const repRegions = r.regions ?? [];
          return target.regions!.some((reg) => repRegions.includes(reg));
        });
      }

      const chosen = pickRandom(candidates);
      if (chosen) {
        const u = await ctx.db
          .query("users")
          .withIndex("by_org_external", (q: any) =>
            q.eq("organizationId", organizationId).eq("externalId", chosen.userId),
          )
          .unique();

        const avatar =
          typeof u?.avatarUrl === "string" && u.avatarUrl.trim() ? u.avatarUrl.trim() : undefined;

        return {
          userId: chosen.userId,
          name: u?.name ?? undefined,
          avatarUrl: avatar,
          title: u?.title ?? undefined,
          role: chosen.role,
          regions: chosen.regions ?? [],
          available: chosen.available,
        };
      }
    }

    // 3) Territories fallback: countryCode -> territories -> reps
    if (matchCountry) {
      const territories = (await ctx.db
        .query("territories")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect()) as Doc<"territories">[];

      const territoryKeys = territories
        .filter((t) => (t.countryCodes ?? []).includes(matchCountry))
        .map((t) => t.key);

      if (territoryKeys.length > 0) {
        const geoCandidates = availableReps.filter((r) => {
          const repRegions = r.regions ?? [];
          return repRegions.some((reg) => territoryKeys.includes(reg));
        });

        const chosen = pickRandom(geoCandidates);
        if (chosen) {
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
          };
        }
      }
    }

    // 4) fallback: any available rep
    const chosen = pickRandom(availableReps);
    if (!chosen) return null;

    const u = await ctx.db
      .query("users")
      .withIndex("by_org_external", (q: any) =>
        q.eq("organizationId", organizationId).eq("externalId", chosen.userId),
      )
      .unique();

    const avatar =
      typeof u?.avatarUrl === "string" && u.avatarUrl.trim() ? u.avatarUrl.trim() : undefined;

    return {
      userId: chosen.userId,
      name: u?.name ?? undefined,
      avatarUrl: avatar,
      title: u?.title ?? undefined,
      role: chosen.role,
      regions: chosen.regions ?? [],
      available: chosen.available,
    };
  },
});
