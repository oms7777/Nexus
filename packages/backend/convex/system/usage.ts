// packages/backend/convex/system/usage.ts
import { internalMutation, internalQuery } from "../_generated/server";
import { ConvexError, v } from "convex/values";

function monthKey(ts: number) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export const getOrCreateUsageRow = internalMutation({
  args: {
    organizationId: v.string(),
    month: v.string(), // "YYYY-MM"
  },
  handler: async (ctx, { organizationId, month }) => {
    const existing = await ctx.db
      .query("usageMonthly")
      .withIndex("by_org_month", (q) => q.eq("organizationId", organizationId).eq("month", month))
      .unique();

    if (existing) return existing;

    const now = Date.now();
    const id = await ctx.db.insert("usageMonthly", {
      organizationId,
      month,
      events: 0,
      aiTokens: 0,
      voiceMinutes: 0,
      updatedAt: now,
    });

    return await ctx.db.get(id);
  },
});

export const addAiTokens = internalMutation({
  args: {
    organizationId: v.string(),
    tokens: v.number(),
    ts: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, tokens, ts }) => {
    const now = Date.now();
    const month = monthKey(ts ?? now);

    const row = await ctx.db
      .query("usageMonthly")
      .withIndex("by_org_month", (q) => q.eq("organizationId", organizationId).eq("month", month))
      .unique();

    if (!row) {
      const id = await ctx.db.insert("usageMonthly", {
        organizationId,
        month,
        events: 0,
        aiTokens: tokens,
        voiceMinutes: 0,
        updatedAt: now,
      });
      return { month, aiTokens: tokens, _id: id };
    }

    await ctx.db.patch(row._id, {
      aiTokens: row.aiTokens + tokens,
      updatedAt: now,
    });

    return { month, aiTokens: row.aiTokens + tokens, _id: row._id };
  },
});

export const assertWithinAiTokenLimit = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, { organizationId }) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (!sub || sub.status !== "active") {
      throw new ConvexError({ code: "PAYMENT_REQUIRED", message: "Subscription inactive" });
    }

    const now = Date.now();
    const month = monthKey(now);

    const usage = await ctx.db
      .query("usageMonthly")
      .withIndex("by_org_month", (q) => q.eq("organizationId", organizationId).eq("month", month))
      .unique();

    const used = usage?.aiTokens ?? 0;
    const limit = sub.limits.aiTokens ?? 0;

    if (limit <= 0) {
      throw new ConvexError({ code: "PAYMENT_REQUIRED", message: "AI tokens not enabled" });
    }

    if (used >= limit) {
      throw new ConvexError({ code: "RATE_LIMITED", message: "AI token limit reached" });
    }

    return { ok: true, used, limit, month };
  },
});
