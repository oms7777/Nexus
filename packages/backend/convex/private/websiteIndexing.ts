import { ConvexError, v } from "convex/values";
import { internalMutation, query, mutation } from "../_generated/server";
import { crawlAndIndexPublicSite } from "./websiteIngest";

type Frequency = "off" | "daily" | "weekly";

function normalizeUrl(url: string): string {
  return url.trim();
}

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });
    }
    const orgId = identity.orgId as string;
    if (!orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
    }

    const row = await ctx.db
      .query("websiteIndexingSettings")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    return (
      row ?? {
        organizationId: orgId,
        rootUrl: "",
        frequency: "off" as Frequency,
        maxPages: undefined,
        enabled: false,
        lastRunAt: undefined,
        lastStatus: undefined,
        lastPagesVisited: undefined,
        lastPagesIndexed: undefined,
        lastError: undefined,
        updatedAt: Date.now(),
      }
    );
  },
});

export const upsertSettings = mutation({
  args: {
    rootUrl: v.string(),
    frequency: v.union(v.literal("off"), v.literal("daily"), v.literal("weekly")),
    maxPages: v.optional(v.number()),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });
    }
    const orgId = identity.orgId as string;
    if (!orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
    }

    const rootUrl = normalizeUrl(args.rootUrl);
    const now = Date.now();

    const existing = await ctx.db
      .query("websiteIndexingSettings")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    const patch = {
      organizationId: orgId,
      rootUrl,
      frequency: args.frequency,
      maxPages: args.maxPages,
      enabled: args.enabled && args.frequency !== "off" && !!rootUrl,
      updatedAt: now,
    } as const;

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("websiteIndexingSettings", patch);
  },
});

function isDue(frequency: Frequency, lastRunAt?: number): boolean {
  if (frequency === "off") return false;
  if (!lastRunAt) return true;
  const ageMs = Date.now() - lastRunAt;
  if (frequency === "daily") return ageMs >= 24 * 60 * 60 * 1000;
  return ageMs >= 7 * 24 * 60 * 60 * 1000;
}

export const runDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Runs without user identity (cron). Iterate all enabled settings.
    const rows = await ctx.db.query("websiteIndexingSettings").collect();

    for (const row of rows) {
      const freq = row.frequency as Frequency;
      if (!row.enabled || !row.rootUrl || freq === "off") continue;
      if (!isDue(freq, row.lastRunAt)) continue;

      try {
        const result = await crawlAndIndexPublicSite(ctx, {
          organizationId: row.organizationId,
          rootUrl: row.rootUrl,
          maxPages: row.maxPages,
        });

        await ctx.db.patch(row._id, {
          lastRunAt: Date.now(),
          lastStatus: "success",
          lastPagesVisited: result.pagesVisited,
          lastPagesIndexed: result.pagesIndexed,
          lastError: undefined,
          updatedAt: Date.now(),
        });
      } catch (err: any) {
        const msg = err?.data?.message ?? err?.message ?? "Failed to index site";
        await ctx.db.patch(row._id, {
          lastRunAt: Date.now(),
          lastStatus: "error",
          lastError: String(msg),
          updatedAt: Date.now(),
        });
      }
    }

    return { ok: true, scanned: rows.length };
  },
});

