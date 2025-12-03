// packages/backend/convex/private/users.ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const meGet = query({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id?.orgId || !id.subject) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_org_external", (q) =>
        q
          .eq("organizationId", id.orgId as string)
          .eq("externalId", id.subject), // 👈 plus tokenIdentifier
      )
      .unique();
  },
});


// ⚠️ on garde le nom pour ne rien casser mais ça gère maintenant tout le profil de base
export const meSetAvatar = mutation({
  args: {
    avatarUrl: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { avatarUrl, title }) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id?.orgId || !id.subject) throw new Error("UNAUTHORIZED");

    const orgId = id.orgId as string;
    const externalId = id.subject; // 👈 le Clerk userId (user_...)

    const existing = await ctx.db
      .query("users")
      .withIndex("by_org_external", (q) =>
        q.eq("organizationId", orgId).eq("externalId", externalId),
      )
      .unique();

    const doc = {
      organizationId: orgId,
      externalId,
      name: id.name ?? undefined,
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
