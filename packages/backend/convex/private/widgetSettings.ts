import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const upsert = mutation({
  args: {
    greetMessage: v.string(),
    defaultSuggestions: v.object({
      suggestion1: v.optional(v.string()),
      suggestion2: v.optional(v.string()),
      suggestion3: v.optional(v.string()),
    }),
    vapiSettings: v.object({
      assistantId: v.optional(v.string()),
      phoneNumber: v.optional(v.string()),
    }),

    // keep root privacyUrl for backward compat (widget may still read it)
    privacyUrl: v.optional(v.string()),

    // full consent configuration (link OR modal)
    consent: v.optional(
      v.object({
        enabled: v.boolean(),
        title: v.optional(v.string()),
        intro: v.optional(v.string()),
        body: v.optional(v.string()),
        acceptLabel: v.optional(v.string()),
        // decline kept in schema for forwards/backwards compat, not used by UI
        declineLabel: v.optional(v.string()),
        version: v.optional(v.string()),

        // NEW
        linkMode: v.optional(v.union(v.literal("link"), v.literal("modal"))),
        privacyUrl: v.optional(v.string()),  // when linkMode = "link"
        modalContent: v.optional(v.string()), // when linkMode = "modal"
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
    }

    const orgId = identity.orgId as string;

    const existing = await ctx.db
      .query("widgetSettings")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    const patch = {
      greetMessage: args.greetMessage,
      defaultSuggestions: args.defaultSuggestions,
      vapiSettings: args.vapiSettings,
      privacyUrl: args.privacyUrl, // kept for backward compat
      consent: args.consent,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    } else {
      const id = await ctx.db.insert("widgetSettings", {
        organizationId: orgId,
        ...patch,
      });
      return id;
    }
  },
});

export const getOne = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
    }

    const widgetSettings = await ctx.db
      .query("widgetSettings")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", identity.orgId as string))
      .unique();

    return widgetSettings;
  },
});
