import { query, mutation } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { normalizeHostname } from "../lib/domains";

/**
 * Public helper for ingestion endpoints (no auth):
 * checks if a hostname is allowed for the given org.
 *
 * This intentionally reveals only a boolean.
 */
export const isAllowedHostname = query({
  args: {
    organizationId: v.string(),
    hostname: v.string(),
  },
  handler: async (
    ctx,
    { organizationId, hostname },
  ): Promise<{ allowed: boolean }> => {
    const h = normalizeHostname(hostname);
    if (!h) return { allowed: false };
    const res = (await ctx.runQuery(
      (internal as any).system.websites.isAllowedHostnameForOrg,
      {
      organizationId,
      hostname: h,
      },
    )) as { allowed?: boolean } | null;
    return { allowed: !!res?.allowed };
  },
});

/**
 * Convenience: allow ingestion to "auto-seed" the first domain in non-production.
 * Disabled in production (enterprise safety).
 */
export const ensureDevDomain = mutation({
  args: {
    organizationId: v.string(),
    hostname: v.string(),
  },
  handler: async (ctx, { organizationId, hostname }) => {
    if (process.env.NODE_ENV === "production") {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not allowed" });
    }
    const h = normalizeHostname(hostname);
    if (!h) return { ok: false };

    const existing = await ctx.db
      .query("websites")
      .withIndex("by_org_normalized_domain", (q) =>
        q.eq("organizationId", organizationId).eq("normalizedDomain", h),
      )
      .unique();

    if (existing) return { ok: true, created: false };

    const now = Date.now();
    await ctx.db.insert("websites", {
      organizationId,
      domain: h,
      normalizedDomain: h,
      name: h,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, created: true };
  },
});

