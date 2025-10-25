// packages/backend/convex/public/users.ts
import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Retourne 1 à 3 avatars aléatoires des users de l'org
 * (ne renvoie jamais d'URL vide/undefined)
 */
export const listOrgAvatars = query({
  args: {
    organizationId: v.string(),
    limit: v.optional(v.number()), // max 3
  },
  handler: async (ctx, { organizationId, limit }) => {
    // Récup users de l'org
    const users = await ctx.db
      .query("users")
      // si tu as un index by_org, utilise-le :
      // .withIndex("by_org", q => q.eq("organizationId", organizationId))
      .collect();

    // Ne garder que les URL valides (=> string[])
    const urls: string[] = users
      .map(u => u.avatarUrl)
      .filter((u): u is string => typeof u === "string" && u.trim().length > 0);

    // Shuffle Fisher–Yates (sur string[])
    for (let i = urls.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = urls[i];
      urls[i] = urls[j];
      urls[j] = tmp;
    }

    const cap = Math.max(1, Math.min(limit ?? 3, 3));
    return urls.slice(0, cap);
  },
});
