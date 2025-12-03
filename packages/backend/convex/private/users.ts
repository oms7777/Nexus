// packages/backend/convex/private/users.ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

/**
 * meGet → Récupère le profil d’un user (avatar, name, title)
 * Corrigé pour supporter :
 *   - Nouveau schéma : externalId = subject (Clerk userId)
 *   - Ancien schéma : externalId = tokenIdentifier
 */
export const meGet = query({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id?.orgId) return null;

    const orgId = id.orgId as string;
    const subject = id.subject;              // Clerk userId
    const token = id.tokenIdentifier;        // ancien externalId

    let userDoc = null;

    // 1️⃣ Nouveau schéma = externalId === subject
    if (subject) {
      userDoc = await ctx.db
        .query("users")
        .withIndex("by_org_external", q =>
          q.eq("organizationId", orgId).eq("externalId", subject)
        )
        .unique();
    }

    // 2️⃣ Ancien schéma = externalId === tokenIdentifier
    if (!userDoc && token) {
      userDoc = await ctx.db
        .query("users")
        .withIndex("by_org_external", q =>
          q.eq("organizationId", orgId).eq("externalId", token)
        )
        .unique();
    }

    return userDoc;
  },
});


/**
 * meSetAvatar → met à jour name + avatar + title
 * ⚠️ corrige MAJEURE :
 *   externalId = id.subject (Clerk userId)
 *   et migration automatique depuis l'ancien schéma.
 */
export const meSetAvatar = mutation({
  args: {
    avatarUrl: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { avatarUrl, title }) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id?.orgId) throw new Error("UNAUTHORIZED");

    const orgId = id.orgId as string;
    const subject = id.subject;              // Nouveau schéma
    const token = id.tokenIdentifier;        // Ancien schéma

    if (!subject) throw new Error("Missing Clerk subject");

    let existing = null;

    // 1️⃣ Chercher un doc avec le nouveau schéma
    existing = await ctx.db
      .query("users")
      .withIndex("by_org_external", q =>
        q.eq("organizationId", orgId).eq("externalId", subject)
      )
      .unique();

    // 2️⃣ fallback ancien schéma
    if (!existing && token) {
      existing = await ctx.db
        .query("users")
        .withIndex("by_org_external", q =>
          q.eq("organizationId", orgId).eq("externalId", token)
        )
        .unique();
    }

    const doc = {
      organizationId: orgId,
      externalId: subject,          // ✔️ Correction définitive
      name: id.name ?? undefined,   // récupéré depuis Clerk automatiquement
      avatarUrl: avatarUrl ?? undefined,
      title: title ?? undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }

    return ctx.db.insert("users", doc);
  },
});
