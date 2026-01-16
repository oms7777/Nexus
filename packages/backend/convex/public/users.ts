import { query } from "../_generated/server";
import { v } from "convex/values";

// Récupère les avatars des utilisateurs d'une organisation, avec un maximum spécifié.
export const listOrgAvatars = query({
  args: { organizationId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { organizationId, limit }) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_org", q => q.eq("organizationId", organizationId))
      .collect();

    const urls: string[] = [];
    for (const u of users) {
      const avatar = u.avatarUrl?.trim();
      if (avatar) urls.push(avatar);  // Ajouter l'URL de l'avatar
    }

    // Mélanger les avatars de manière aléatoire
    for (let i = urls.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = urls[i]!;      // assertion non-nulle
      urls[i] = urls[j]!;
      urls[j] = tmp;
    }

    // Limiter le nombre de résultats retournés
    const cap = Math.max(1, Math.min(limit ?? 3, 3));
    return urls.slice(0, cap);
  },
});
