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

    return { ok: true, allowed: !!(row && row.active) };
  },
});

