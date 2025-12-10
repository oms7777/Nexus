// packages/backend/convex/public/promos.ts
import { query } from "../_generated/server";
import { v } from "convex/values";

type Rules = {
  pathPrefix?: string;
  urlIncludes?: string[];
  utmSource?: string[];
};

function normalizeRules(rules?: Rules | null): Rules | undefined {
  if (!rules) return undefined;

  const pathPrefix = rules.pathPrefix?.trim() || undefined;

  const urlIncludes =
    rules.urlIncludes
      ?.map((s) => s.trim())
      .filter(Boolean) || undefined;

  const utmSource =
    rules.utmSource
      ?.map((s) => s.trim())
      .filter(Boolean) || undefined;

  if (!pathPrefix && !urlIncludes && !utmSource) return undefined;

  return { pathPrefix, urlIncludes, utmSource };
}

function matches(url: string, utm: string | undefined, rawRules?: Rules) {
  const rules = normalizeRules(rawRules);
  if (!rules) return true;

  try {
    const u = new URL(url);

    // 1) Path prefix
    if (rules.pathPrefix && !u.pathname.startsWith(rules.pathPrefix)) {
      return false;
    }

    // 2) URL includes (pathname ou query)
    if (rules.urlIncludes?.length) {
      const hit = rules.urlIncludes.some(
        (s) => u.pathname.includes(s) || u.search.includes(s),
      );
      if (!hit) return false;
    }

    // 3) UTM source
    if (rules.utmSource?.length) {
      if (!utm || !rules.utmSource.includes(utm)) return false;
    }

    return true;
  } catch (err) {
    console.error("promos.matches – invalid URL", url, err);
    return false;
  }
}

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

      // Debug léger si tu veux voir dans le log Convex
      console.log("promos:listForPage", {
        org: organizationId,
        currentUrl,
        utmSource,
        active: active.length,
        matched: matched.length,
      });

      return matched;
    } catch (err) {
      console.error("promos:listForPage failed", err);
      return [];
    }
  },
});
