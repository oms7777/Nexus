// packages/backend/convex/private/users.ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const meGet = query({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id?.orgId || !id.tokenIdentifier) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_org_external", (q) =>
        q.eq("organizationId", id.orgId as string).eq("externalId", id.tokenIdentifier)
      )
      .unique();
  },
});

export const meSetAvatar = mutation({
  args: { avatarUrl: v.optional(v.string()) },
  handler: async (ctx, { avatarUrl }) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id?.orgId || !id.tokenIdentifier) throw new Error("UNAUTHORIZED");

    const orgId = id.orgId as string;
    const externalId = id.tokenIdentifier;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_org_external", (q) =>
        q.eq("organizationId", orgId).eq("externalId", externalId)
      )
      .unique();

    const doc = {
      organizationId: orgId,
      externalId,
      name: id.name ?? undefined,        // <- undefined, not null
      avatarUrl: avatarUrl ?? undefined, // <- undefined, not null
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }
    return ctx.db.insert("users", doc);
  },
});
