// packages/backend/convex/routing.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

/**
 * Helpers
 */
function normalizeCountryCode(cc?: string): string | undefined {
  if (!cc) return undefined;
  const x = cc.trim();
  if (!x) return undefined;
  return x.toUpperCase();
}

function normalizeUtmSource(s?: string): string | undefined {
  if (!s) return undefined;
  const x = s.trim().toLowerCase();
  return x ? x : undefined;
}

function extractUtmSourceFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const v = u.searchParams.get("utm_source");
    return normalizeUtmSource(v ?? undefined);
  } catch {
    return undefined;
  }
}

function pickRandom<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx] ?? null;
}

/**
 * Est-ce qu'une règle matche ce visiteur ?
 */
function ruleMatches(
  rule: Doc<"routingRules">,
  ctx: { countryCode?: string; currentUrl?: string; utmSource?: string },
): boolean {
  const m = rule.match ?? {};

  // countries
  if (m.countries && m.countries.length > 0) {
    const normalizedRuleCountries = m.countries
      .map((c) => normalizeCountryCode(c))
      .filter(Boolean) as string[];

    if (!ctx.countryCode || !normalizedRuleCountries.includes(ctx.countryCode)) return false;
  }

  // URL substring
  if (m.urlIncludes && m.urlIncludes.length > 0) {
    if (!ctx.currentUrl) return false;
    const url = ctx.currentUrl.toLowerCase();
    const ok = m.urlIncludes.some((sub: string) => url.includes(String(sub).toLowerCase()));
    if (!ok) return false;
  }

  // utm_source
  if (m.utmSource && m.utmSource.length > 0) {
    const normalizedRuleUtm = m.utmSource
      .map((x) => normalizeUtmSource(x))
      .filter(Boolean) as string[];
    if (!ctx.utmSource || !normalizedRuleUtm.includes(ctx.utmSource)) return false;
  }

  return true;
}

/**
 * Calcule les territory.key qui couvrent un countryCode donné.
 */
async function resolveTerritoryKeysForCountry(
  ctx: any,
  organizationId: string,
  countryCode?: string,
): Promise<string[]> {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) return [];

  const territories = (await ctx.db
    .query("territories")
    .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
    .collect()) as Doc<"territories">[];

  return territories
    .filter((t) => (t.countryCodes ?? []).includes(normalized))
    .map((t) => t.key);
}

type AssignmentResult = {
  assignedRepUserId: string | null;
  assignedTerritoryKey: string | null;
  reason:
    | "already_assigned"
    | "forced"
    | "preferred_rep"
    | "rule"
    | "territory_fallback"
    | "available_fallback"
    | "none";
};

/**
 * ✅ THE ONE TRUE ENGINE:
 * - If already assigned => return it
 * - Else decide once (preferred -> rules -> territory -> any available)
 * - Persist on contactSessions (top-level)
 *
 * IMPORTANT: In DB, optional strings must be string | undefined (never null).
 * We keep null only in the RETURN shape (API).
 */
export const ensureAssignmentForSession = mutation({
  args: {
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),

    // Optional: force a rep (used by calendar best-slot picker)
    forceUserId: v.optional(v.string()),
    forceTerritoryKey: v.optional(v.string()),

    // Optional: force recompute even if assigned exists (rare / admin tools)
    forceRecompute: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { organizationId, contactSessionId, forceUserId, forceTerritoryKey, forceRecompute },
  ) => {
    const session = await ctx.db.get(contactSessionId);
    if (!session)
      return { assignedRepUserId: null, assignedTerritoryKey: null, reason: "none" } as AssignmentResult;
    if (session.organizationId !== organizationId)
      return { assignedRepUserId: null, assignedTerritoryKey: null, reason: "none" } as AssignmentResult;
    if (session.expiresAt && session.expiresAt < Date.now())
      return { assignedRepUserId: null, assignedTerritoryKey: null, reason: "none" } as AssignmentResult;

    // 0) Force set (DB: undefined, return: null ok)
    if (forceUserId) {
      await ctx.db.patch(contactSessionId, {
        assignedRepUserId: forceUserId,
        assignedTerritoryKey: forceTerritoryKey ?? undefined,
      });
      return {
        assignedRepUserId: forceUserId,
        assignedTerritoryKey: forceTerritoryKey ?? null,
        reason: "forced",
      } as AssignmentResult;
    }

    // 1) Stable assignment already exists
    if (!forceRecompute && session.assignedRepUserId) {
      return {
        assignedRepUserId: (session.assignedRepUserId as string | undefined) ?? null,
        assignedTerritoryKey: (session.assignedTerritoryKey as string | undefined) ?? null,
        reason: "already_assigned",
      } as AssignmentResult;
    }

    const currentUrl = (session.metadata?.currentUrl as string | undefined) ?? undefined;

    const matchCtx = {
      countryCode: normalizeCountryCode(session.metadata?.countryCode as string | undefined),
      currentUrl,
      utmSource:
        normalizeUtmSource(session.metadata?.utmSource as string | undefined) ??
        extractUtmSourceFromUrl(currentUrl),
    };

    // 2) Load reps (source of truth)
    const reps = (await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
      .collect()) as Doc<"repsPresence">[];

    if (!reps.length) {
      await ctx.db.patch(contactSessionId, {
        assignedRepUserId: undefined,
        assignedTerritoryKey: undefined,
      });
      return { assignedRepUserId: null, assignedTerritoryKey: null, reason: "none" } as AssignmentResult;
    }

    const availableReps = reps.filter((r) => r.available);
    if (!availableReps.length) {
      await ctx.db.patch(contactSessionId, {
        assignedRepUserId: undefined,
        assignedTerritoryKey: undefined,
      });
      return { assignedRepUserId: null, assignedTerritoryKey: null, reason: "none" } as AssignmentResult;
    }

    // 3) Preferred rep (top-level first, then legacy metadata)
    const preferredRepUserId =
      (session.preferredRepUserId as string | undefined) ||
      (session.metadata?.preferredRepUserId as string | undefined);

    if (preferredRepUserId) {
      const preferred = availableReps.find((r) => r.userId === preferredRepUserId);
      if (preferred) {
        await ctx.db.patch(contactSessionId, {
          assignedRepUserId: preferred.userId,
          assignedTerritoryKey: undefined,
        });
        return {
          assignedRepUserId: preferred.userId,
          assignedTerritoryKey: null,
          reason: "preferred_rep",
        } as AssignmentResult;
      }
    }

    // 4) Rules by priority
    const rules = (await ctx.db
      .query("routingRules")
      .withIndex("by_org_prio", (q: any) => q.eq("organizationId", organizationId))
      .order("asc")
      .take(100)) as Doc<"routingRules">[];

    for (const rule of rules) {
      if (rule.enabled === false) continue;
      if (!ruleMatches(rule, matchCtx)) continue;

      const target = rule.routeTo;
      let candidates = availableReps;

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
        // stable "territoryKey" for analytics/debug
        const assignedTerritoryKey: string | null =
          (target.regions && target.regions.length ? target.regions[0] : null) ?? null;

        await ctx.db.patch(contactSessionId, {
          assignedRepUserId: chosen.userId,
          assignedTerritoryKey: assignedTerritoryKey ?? undefined,
        });

        return {
          assignedRepUserId: chosen.userId,
          assignedTerritoryKey,
          reason: "rule",
        } as AssignmentResult;
      }
    }

    // 5) Territory fallback
    if (matchCtx.countryCode) {
      const territoryKeys = await resolveTerritoryKeysForCountry(ctx, organizationId, matchCtx.countryCode);

      if (territoryKeys.length > 0) {
        const geoCandidates = availableReps.filter((r) => {
          const repRegions = r.regions ?? [];
          return repRegions.some((reg) => territoryKeys.includes(reg));
        });

        const chosen = pickRandom(geoCandidates);
        if (chosen) {
          const assignedTerritoryKey: string | null = territoryKeys[0] ?? null;

          await ctx.db.patch(contactSessionId, {
            assignedRepUserId: chosen.userId,
            assignedTerritoryKey: assignedTerritoryKey ?? undefined,
          });

          return {
            assignedRepUserId: chosen.userId,
            assignedTerritoryKey,
            reason: "territory_fallback",
          } as AssignmentResult;
        }
      }
    }

    // 6) Any available rep
    const chosen = pickRandom(availableReps);
    if (chosen) {
      await ctx.db.patch(contactSessionId, {
        assignedRepUserId: chosen.userId,
        assignedTerritoryKey: undefined,
      });
      return {
        assignedRepUserId: chosen.userId,
        assignedTerritoryKey: null,
        reason: "available_fallback",
      } as AssignmentResult;
    }

    // should never happen, but safe
    await ctx.db.patch(contactSessionId, {
      assignedRepUserId: undefined,
      assignedTerritoryKey: undefined,
    });
    return { assignedRepUserId: null, assignedTerritoryKey: null, reason: "none" } as AssignmentResult;
  },
});

/**
 * Backward compat / convenience:
 * ✅ ONLY returns the stable value.
 * (No more "random pick" inside queries.)
 */
export const pickRepForSession = query({
  args: {
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
  },
  handler: async (ctx, { organizationId, contactSessionId }) => {
    const session = await ctx.db.get(contactSessionId);
    if (!session) return null;
    if (session.organizationId !== organizationId) return null;
    if (session.expiresAt && session.expiresAt < Date.now()) return null;
    return (session.assignedRepUserId as string | undefined) ?? null;
  },
});