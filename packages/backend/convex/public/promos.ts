// packages/backend/convex/public/promos.ts
import { query } from "../_generated/server";
import { v } from "convex/values";

function matches(
  url: string,
  utm: string | undefined,
  rules?: {
    pathPrefix?: string;
    urlIncludes?: string[];
    utmSource?: string[];
  }
) {
  if (!rules) return true;
  try {
    const u = new URL(url);

    if (rules.pathPrefix && !u.pathname.startsWith(rules.pathPrefix)) return false;

    if (rules.urlIncludes?.length) {
      const hit = rules.urlIncludes.some(s => u.pathname.includes(s) || u.search.includes(s));
      if (!hit) return false;
    }

    if (rules.utmSource?.length) {
      if (!utm || !rules.utmSource.includes(utm)) return false;
    }

    return true;
  } catch {
    // invalid currentUrl → just no match
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
      // If args are missing, treat as "no promos" instead of throwing.
      if (!organizationId || !currentUrl) return [];

      const all = await ctx.db
        .query("promos")
        .withIndex("by_org", q => q.eq("organizationId", organizationId))
        .collect();

      const active = all.filter(p => p.active);
      return active.filter(p => matches(currentUrl, utmSource, p.rules));
    } catch (err) {
      console.error("promos:listForPage failed", err);
      return [];
    }
  },
});
