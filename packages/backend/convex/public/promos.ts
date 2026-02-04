// packages/backend/convex/public/promos.ts
import { query } from "../_generated/server";
import { v } from "convex/values";

type PathMode = "prefix" | "exact";

type Rules = {
  pathPrefix?: string;
  pathMode?: PathMode;

  // legacy fields kept for compatibility with existing docs,
  // but we intentionally ignore them in matching to keep it simple.
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
  if (input == null) return undefined;

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

function normalizeRules(raw?: Rules | null): { pathPrefix: string; pathMode: PathMode } {
  const prefix = normalizePathPrefix(raw?.pathPrefix);
  const mode: PathMode = (raw?.pathMode as PathMode) ?? "prefix";

  // ✅ Important: empty path = match all (same as "/" prefix)
  return {
    pathPrefix: prefix ?? "/",
    pathMode: mode,
  };
}

/* -------------------- Matching -------------------- */

function normalizePathname(pathname: string): string {
  let p = pathname || "/";
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  p = p.replace(/\/{2,}/g, "/");
  return p;
}

function matches(url: string, rawRules?: Rules) {
  const rules = normalizeRules(rawRules);

  try {
    const u = new URL(url);
    const pathname = normalizePathname(u.pathname);

    const pref = rules.pathPrefix;
    const mode = rules.pathMode;

    // "/" in prefix mode => match all pages
    if (pref === "/" && mode === "prefix") return true;

    // "/" in exact mode => homepage only
    if (pref === "/" && mode === "exact") return pathname === "/";

    // exact mode => only this page
    if (mode === "exact") return pathname === pref;

    // prefix mode
    return pathname.startsWith(pref);
  } catch (err) {
    console.error("promos.matches – invalid URL", url, err);
    return false;
  }
}

/* -------------------- Specificity ranking -------------------- */

function ruleSpecificity(rawRules?: Rules | null): number {
  // ✅ Use normalized rules so empty path behaves like "/"
  const rules = normalizeRules(rawRules);

  // Longer prefix = more specific.
  // Exact gets a big boost so:
  // "/" exact (homepage only) beats "/" prefix (all pages)
  // "/pricing" exact beats "/pricing" prefix
  const exactBoost = rules.pathMode === "exact" ? 1000 : 0;

  // Special-case: "/" prefix is the least specific possible
  const baseLen = rules.pathPrefix === "/" ? 0 : rules.pathPrefix.length;

  return exactBoost + baseLen * 10;
}

/* -------------------- Query principale -------------------- */

export const listForPage = query({
  args: {
    organizationId: v.optional(v.string()),
    currentUrl: v.optional(v.string()),

    // legacy arg kept for compatibility with existing callers
    utmSource: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, currentUrl }) => {
    try {
      if (!organizationId || !currentUrl) return [];

      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
        .unique();

      if (!canUseAdvancedPromos(sub)) return [];

      const all = await ctx.db
        .query("promos")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect();

      const active = all.filter((p) => p.active && p.showNudge !== false);

      const matched = active.filter((p) => matches(currentUrl, p.rules as Rules));

      matched.sort(
        (a, b) => ruleSpecificity(b.rules as Rules) - ruleSpecificity(a.rules as Rules),
      );

      let pathname = "";
      try {
        pathname = new URL(currentUrl).pathname;
      } catch {}

      console.log("promos:listForPage", {
        org: organizationId,
        currentUrl,
        pathname,
        total: all.length,
        active: active.length,
        matched: matched.length,
        chosen: matched[0]?._id,
        chosenRules: matched[0]?.rules,
        chosenSpecificity: matched[0]?.rules ? ruleSpecificity(matched[0].rules as Rules) : null,
      });

      return matched;
    } catch (err) {
      console.error("promos:listForPage failed", err);
      return [];
    }
  },
});
