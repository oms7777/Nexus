import { query } from "../_generated/server";
import { v } from "convex/values";

type PathMode = "prefix" | "exact";

type Rules = {
  pathPrefix?: string;
  pathMode?: PathMode;
};

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
  return {
    pathPrefix: prefix ?? "/",
    pathMode: mode,
  };
}

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

    // "/" prefix in prefix mode => match all pages
    if (pref === "/" && mode === "prefix") return true;

    // "/" prefix in exact mode => homepage only
    if (pref === "/" && mode === "exact") return pathname === "/";

    if (mode === "exact") return pathname === pref;
    return pathname.startsWith(pref);
  } catch {
    return false;
  }
}

function ruleSpecificity(rawRules?: Rules | null): number {
  const rules = normalizeRules(rawRules);
  const exactBoost = rules.pathMode === "exact" ? 1000 : 0;
  const baseLen = rules.pathPrefix === "/" ? 0 : rules.pathPrefix.length;
  return exactBoost + baseLen * 10;
}

export const getForPage = query({
  args: {
    organizationId: v.optional(v.string()),
    currentUrl: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, currentUrl }) => {
    try {
      if (!organizationId || !currentUrl) return null;

      const all = await ctx.db
        .query("pageNudges")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect();

      const active = all.filter((n) => n.active !== false);

      const matched = active.filter((n) => matches(currentUrl, n.rules as Rules));

      matched.sort((a, b) => ruleSpecificity(b.rules as Rules) - ruleSpecificity(a.rules as Rules));

      return matched[0] ?? null;
    } catch (err) {
      console.error("nudges:getForPage failed", err);
      return null;
    }
  },
});

