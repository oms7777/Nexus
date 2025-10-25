// packages/backend/convex/public/users.ts
import { query } from "../_generated/server";
import { v } from "convex/values";

export const listOrgAvatars = query({
  args: { organizationId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { organizationId, limit }) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_org", q => q.eq("organizationId", organizationId))
      .collect();

    const urls: string[] = [];
    for (const u of users) {
      const a = u.avatarUrl?.trim();
      if (a) urls.push(a);
    }

    for (let i = urls.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = urls[i]!;      // non-null assertion
    urls[i] = urls[j]!;
    urls[j] = tmp;
    }

    const cap = Math.max(1, Math.min(limit ?? 3, 3));
    return urls.slice(0, cap);
  },
});
