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
    name: v.optional(v.string()),
  },
  handler: async (ctx, { avatarUrl, title, name }) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id?.orgId) throw new Error("UNAUTHORIZED");

    const orgId = id.orgId as string;
    const subject = id.subject;
    const token = id.tokenIdentifier;

    if (!subject) throw new Error("Missing Clerk subject");

    // Find existing (subject first)
    let existing =
      (await ctx.db
        .query("users")
        .withIndex("by_org_external", (q) =>
          q.eq("organizationId", orgId).eq("externalId", subject),
        )
        .unique()) ?? null;

    // fallback old schema (tokenIdentifier)
    if (!existing && token) {
      existing =
        (await ctx.db
          .query("users")
          .withIndex("by_org_external", (q) =>
            q.eq("organizationId", orgId).eq("externalId", token),
          )
          .unique()) ?? null;
    }

    const baseDoc: any = {
      organizationId: orgId,
      externalId: subject,
      updatedAt: Date.now(),
    };

    // ✅ IMPORTANT: patch only provided fields (do NOT overwrite with undefined)
    const patch: any = { ...baseDoc };
    if (typeof avatarUrl === "string") patch.avatarUrl = avatarUrl || undefined;
    if (typeof title === "string") patch.title = title || undefined;
    if (typeof name === "string") patch.name = name || undefined;

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    // Insert: include known fields
    const insertDoc: any = {
      ...baseDoc,
      name: typeof name === "string" ? name || undefined : id.name ?? undefined,
      avatarUrl: typeof avatarUrl === "string" ? avatarUrl || undefined : undefined,
      title: typeof title === "string" ? title || undefined : undefined,
    };

    return ctx.db.insert("users", insertDoc);
  },
});
