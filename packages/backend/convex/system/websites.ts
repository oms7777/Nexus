import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { normalizeHostname } from "../lib/domains";

export const isAllowedHostnameForOrg = internalQuery({
  args: {
    organizationId: v.string(),
    hostname: v.string(),
  },
  handler: async (ctx, { organizationId, hostname }) => {
    const h = normalizeHostname(hostname);
    if (!h) return { ok: false, allowed: false };

    const row = await ctx.db
      .query("websites")
      .withIndex("by_org_normalized_domain", (q) =>
        q.eq("organizationId", organizationId).eq("normalizedDomain", h),
      )
      .unique();

    if (row && row.active) {
      return { ok: true, allowed: true };
    }

    // Fallback: legacy / migration rows where `normalizedDomain` on disk doesn't match the index
    // lookup (older only had `domain`, or one-off bad writes). Keeps ingestion working after
    // schema changes without forcing a manual data fix.
    const all = await ctx.db
      .query("websites")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();

    for (const w of all) {
      if (!w.active) continue;
      const keys = new Set<string>();
      if (typeof w.normalizedDomain === "string" && w.normalizedDomain.trim()) {
        keys.add(w.normalizedDomain.trim().toLowerCase());
      }
      const fromDomain = normalizeHostname(w.domain);
      if (fromDomain) keys.add(fromDomain);

      if (keys.has(h)) {
        return { ok: true, allowed: true };
      }
    }

    return { ok: true, allowed: false };
  },
});

