// packages/backend/convex/private/users.ts
import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";

export const meGet = query({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id?.orgId) return null;

    const orgId = id.orgId as string;
    const subject = id.subject;
    const token = id.tokenIdentifier;

    if (subject) {
      const doc = await ctx.db
        .query("users")
        .withIndex("by_org_external", (q) =>
          q.eq("organizationId", orgId).eq("externalId", subject),
        )
        .unique();
      if (doc) return doc;
    }

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
    if (!id?.orgId) throw new ConvexError({ code: "UNAUTHORIZED", message: "UNAUTHORIZED" });

    const orgId = id.orgId as string;
    const subject = id.subject;
    const token = id.tokenIdentifier;

    if (!subject) throw new ConvexError({ code: "UNAUTHORIZED", message: "Missing Clerk subject" });

    // 1) chercher sur subject
    let existing =
      (await ctx.db
        .query("users")
        .withIndex("by_org_external", (q) =>
          q.eq("organizationId", orgId).eq("externalId", subject),
        )
        .unique()) ?? null;

    // 2) fallback tokenIdentifier (legacy)
    const legacy =
      !existing && token
        ? (await ctx.db
            .query("users")
            .withIndex("by_org_external", (q) =>
              q.eq("organizationId", orgId).eq("externalId", token),
            )
            .unique()) ?? null
        : null;

    // ✅ MIGRATION: si doc legacy existe, on "migre" vers subject
    if (!existing && legacy) {
      await ctx.db.patch(legacy._id, {
        externalId: subject, // <- clé stable désormais
      });
      existing = legacy;
    }

    // patch uniquement champs fournis
    const patch: any = {};
    if (typeof avatarUrl === "string") patch.avatarUrl = avatarUrl || undefined;
    if (typeof title === "string") patch.title = title || undefined;
    if (typeof name === "string") patch.name = name || undefined;

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    // insert
    const insertDoc: any = {
      organizationId: orgId,
      externalId: subject,
      name: typeof name === "string" ? name || undefined : id.name ?? undefined,
      avatarUrl: typeof avatarUrl === "string" ? avatarUrl || undefined : undefined,
      title: typeof title === "string" ? title || undefined : undefined,
    };

    return ctx.db.insert("users", insertDoc);
  },
});
