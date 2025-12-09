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

    // Optional marketing / branding
    teamAvatars: v.optional(v.array(v.string())),
    brandLogoUrl: v.optional(v.string()),
    theme: v.optional(
      v.object({
        primaryColor: v.optional(v.string()),
        primaryTextColor: v.optional(v.string()),
        secondaryColor: v.optional(v.string()),
        nudgeBackgroundColor: v.optional(v.string()),
        chatBubbleColor: v.optional(v.string()),
      })
    ),

    // Back-compat + full consent
    privacyUrl: v.optional(v.string()),
    consent: v.optional(
      v.object({
        enabled: v.boolean(),
        title: v.optional(v.string()),
        intro: v.optional(v.string()),
        body: v.optional(v.string()),
        acceptLabel: v.optional(v.string()),
        declineLabel: v.optional(v.string()),
        version: v.optional(v.string()),
        linkMode: v.optional(v.union(v.literal("link"), v.literal("modal"))),
        privacyUrl: v.optional(v.string()),
        modalContent: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.orgId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Organization not found",
      });
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
      teamAvatars: args.teamAvatars,
      brandLogoUrl: args.brandLogoUrl,
      theme: args.theme,
      privacyUrl: args.privacyUrl,
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
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Organization not found",
      });
    }

    const widgetSettings = await ctx.db
      .query("widgetSettings")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", identity.orgId as string)
      )
      .unique();

    return widgetSettings;
  },
});

export const setRoutingMode = mutation({
  args: {
    routingMode: v.union(
      v.literal("auto_assign"),
      v.literal("visitor_choice")
    ),
  },
  handler: async (ctx, { routingMode }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.orgId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Organization not found",
      });
    }
    const orgId = identity.orgId as string;

    const existing = await ctx.db
      .query("widgetSettings")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { routingMode });
      return existing._id;
    }

    const id = await ctx.db.insert("widgetSettings", {
      organizationId: orgId,
      greetMessage: "",
      defaultSuggestions: {
        suggestion1: undefined,
        suggestion2: undefined,
        suggestion3: undefined,
      },
      vapiSettings: {
        assistantId: undefined,
        phoneNumber: undefined,
      },
      teamAvatars: undefined,
      brandLogoUrl: undefined,
      theme: undefined,
      privacyUrl: undefined,
      consent: undefined,
      routingMode,
    });

    return id;
  },
});
