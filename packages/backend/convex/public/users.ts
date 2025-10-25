// packages/backend/convex/public/users.ts
import { v } from "convex/values";
import { query } from "../_generated/server";

export const avatarsByOrg = query({
  args: { organizationId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { organizationId, limit }) => {
    const rows = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();

    const urls = rows
      .map((u) => (u as any).avatarUrl as string | undefined)
      .filter((x): x is string => !!x && x.trim().length > 0);

    // shuffle
    for (let i = urls.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [urls[i], urls[j]] = [urls[j], urls[i]];
    }
    return urls.slice(0, Math.max(1, Math.min(limit ?? 3, 3)));
  },
});
