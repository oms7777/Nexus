// packages/backend/convex/private/users.ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const meGet = query({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id?.orgId) return null;

    const orgId = id.orgId as string;
    const subject = id.subject;
    const token = id.tokenIdentifier;

    // 1) new schema: externalId = subject
    if (subject) {
      const doc = await ctx.db
        .query("users")
        .withIndex("by_org_external", (q) =>
          q.eq("organizationId", orgId).eq("externalId", subject),
        )
        .unique();
      if (doc) return doc;
    }

    // 2) old schema: externalId = tokenIdentifier
    if (token) {
      const doc = await ctx.db
        .query("users")
        .withIndex("by_org_external", (q) =>
          q.eq("organizationId", orgId).eq("externalId", token),
        )
        .unique();
      if (doc) return doc;
    }

    return null;
  },
});

export const meSetAvatar = mutation({
  args: {
    avatarUrl: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { avatarUrl, title }) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id?.orgId) throw new Error("UNAUTHORIZED");

    const orgId = id.orgId as string;
    const subject = id.subject;
    const token = id.tokenIdentifier;

    if (!subject) throw new Error("Missing Clerk subject");

    let existing = null;

    // Check user document
    existing = await ctx.db
      .query("users")
      .withIndex("by_org_external", q =>
        q.eq("organizationId", orgId).eq("externalId", subject)
      )
      .unique();

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
      externalId: subject,
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
