// packages/backend/convex/system/usage.ts
import { internalMutation, internalQuery } from "../_generated/server";
import { ConvexError, v } from "convex/values";

function monthKey(ts: number) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/* -------------------------------------------------------------
 * Cost circuit breaker
 *
 * `public.messages.create` is an unauthenticated endpoint that calls a paid LLM.
 * These are deliberately generous safety limits, not plan entitlements: the goal
 * is to survive a scraper or a runaway loop, not to meter customers.
 * ----------------------------------------------------------- */

const DEFAULTS = {
  /** Per organization, per calendar month. */
  monthlyCap: 5000,
  /** Per visitor session, per rolling window. */
  windowMs: 5 * 60 * 1000,
  maxPerWindow: 30,
};

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

export type AiMessageBudget =
  | { allowed: true; used: number; cap: number }
  | { allowed: false; reason: "RATE_LIMITED" | "MONTHLY_CAP" };

export const consumeAiMessage = internalMutation({
  args: {
    organizationId: v.string(),
    /** Visitor bucket key — the contact session id. */
    subjectKey: v.string(),
  },
  handler: async (ctx, { organizationId, subjectKey }): Promise<AiMessageBudget> => {
    const now = Date.now();

    // 1) Burst protection per visitor.
    const windowMs = envInt("AI_RATE_WINDOW_MS", DEFAULTS.windowMs);
    const maxPerWindow = envInt("AI_RATE_MAX_PER_WINDOW", DEFAULTS.maxPerWindow);

    const bucket = await ctx.db
      .query("aiRateLimits")
      .withIndex("by_org_subject", (q) =>
        q.eq("organizationId", organizationId).eq("subjectKey", subjectKey),
      )
      .unique();

    if (!bucket) {
      await ctx.db.insert("aiRateLimits", {
        organizationId,
        subjectKey,
        windowStartedAt: now,
        count: 1,
        updatedAt: now,
      });
    } else if (now - bucket.windowStartedAt > windowMs) {
      await ctx.db.patch(bucket._id, { windowStartedAt: now, count: 1, updatedAt: now });
    } else if (bucket.count >= maxPerWindow) {
      return { allowed: false, reason: "RATE_LIMITED" };
    } else {
      await ctx.db.patch(bucket._id, { count: bucket.count + 1, updatedAt: now });
    }

    // 2) Monthly ceiling per organization.
    const month = monthKey(now);
    const cap = envInt("AI_MESSAGES_MONTHLY_CAP", DEFAULTS.monthlyCap);

    const row = await ctx.db
      .query("usageMonthly")
      .withIndex("by_org_month", (q) => q.eq("organizationId", organizationId).eq("month", month))
      .unique();

    const used = row?.aiMessages ?? 0;
    if (used >= cap) {
      console.log(
        `[usage] monthly AI message cap reached org=${organizationId} month=${month} cap=${cap}`,
      );
      return { allowed: false, reason: "MONTHLY_CAP" };
    }

    if (!row) {
      await ctx.db.insert("usageMonthly", {
        organizationId,
        month,
        events: 0,
        aiTokens: 0,
        voiceMinutes: 0,
        aiMessages: 1,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(row._id, { aiMessages: used + 1, updatedAt: now });
    }

    return { allowed: true, used: used + 1, cap };
  },
});

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
