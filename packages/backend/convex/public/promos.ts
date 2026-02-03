// packages/backend/convex/public/promos.ts
import { query } from "../_generated/server";
import { v } from "convex/values";

type Rules = {
  pathPrefix?: string;
  urlIncludes?: string[];
  utmSource?: string[];
};

type Plan = "starter" | "growth" | "enterprise";

function isSubActive(sub: any) {
  const status = (sub?.status ?? "paused") as string;
  return status === "active" || status === "trial";
}

function canUseAdvancedPromos(sub: any) {
  const plan = (sub?.plan ?? "starter") as Plan;
  return isSubActive(sub) && (plan === "growth" || plan === "enterprise");
}

/* -------------------- Normalisation helpers -------------------- */

function normalizePathPrefix(input?: string | null): string | undefined {
  if (!input) return undefined;

  let s = input.trim();
  if (!s) return undefined;

  // If someone pasted a full URL, keep only pathname
  if (/^https?:\/\//i.test(s)) {
    try {
      s = new URL(s).pathname || "/";
    } catch {
      // keep raw if parse fails
    }
  }

  // Ensure it starts with "/"
  if (!s.startsWith("/")) s = `/${s}`;

  // Normalize multiple slashes
  s = s.replace(/\/{2,}/g, "/");

  // Remove trailing slash except root "/"
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);

  return s;
}

function normalizeList(list?: string[] | null): string[] | undefined {
  const out =
    list?.map((x) => (x ?? "").trim()).filter(Boolean) ?? undefined;
  return out && out.length ? out : undefined;
}

function normalizeRules(rules?: Rules | null): Rules | undefined {
  if (!rules) return undefined;

  const pathPrefix = normalizePathPrefix(rules.pathPrefix);
  const urlIncludes = normalizeList(rules.urlIncludes);
  const utmSource = normalizeList(rules.utmSource);

  if (!pathPrefix && !urlIncludes && !utmSource) return undefined;
  return { pathPrefix, urlIncludes, utmSource };
}

/* -------------------- Matching -------------------- */

function normalizePathname(pathname: string): string {
  let p = pathname || "/";
  // remove trailing slash except root
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  // normalize repeated slashes
  p = p.replace(/\/{2,}/g, "/");
  return p;
}

function matches(url: string, utm: string | undefined, rawRules?: Rules) {
  const rules = normalizeRules(rawRules);
  if (!rules) return true;

  try {
    const u = new URL(url);
    const pathname = normalizePathname(u.pathname);
    const search = u.search || "";

    // ✅ pathPrefix
    if (rules.pathPrefix) {
      // "/" means match all
      if (rules.pathPrefix !== "/") {
        const pref = rules.pathPrefix;
        if (!pathname.startsWith(pref)) return false;
      }
    }

    // ✅ urlIncludes: checks pathname OR querystring
    if (rules.urlIncludes?.length) {
      const hit = rules.urlIncludes.some(
        (s) => pathname.includes(s) || search.includes(s),
      );
      if (!hit) return false;
    }

    // ✅ utmSource
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

function ruleSpecificity(rawRules?: Rules | null): number {
  const rules = normalizeRules(rawRules);
  if (!rules) return 0;

  let score = 0;

  // prefer longer prefixes (more specific)
  if (rules.pathPrefix) score += rules.pathPrefix.length * 10;
  if (rules.urlIncludes?.length) score += rules.urlIncludes.length * 5;
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

      // ✅ gate plan/status
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique();

      if (!canUseAdvancedPromos(sub)) {
        return [];
      }

      const all = await ctx.db
        .query("promos")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect();

      // showNudge defaults to true when undefined
      const active = all.filter((p) => p.active && p.showNudge !== false);

      const matched = active.filter((p) =>
        matches(currentUrl, utmSource, p.rules as Rules),
      );

      matched.sort(
        (a, b) =>
          ruleSpecificity(b.rules as Rules) - ruleSpecificity(a.rules as Rules),
      );

      // ✅ debug: helps catch prefix mismatch instantly
      let pathname = "";
      try {
        pathname = new URL(currentUrl).pathname;
      } catch {}

      console.log("promos:listForPage", {
        org: organizationId,
        currentUrl,
        pathname,
        utmSource,
        total: all.length,
        active: active.length,
        matched: matched.length,
        chosen: matched[0]?._id,
        chosenRules: matched[0]?.rules,
      });

      return matched;
    } catch (err) {
      console.error("promos:listForPage failed", err);
      return [];
    }
  },
});
