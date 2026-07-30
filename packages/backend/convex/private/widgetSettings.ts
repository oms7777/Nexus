import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireOrgManager } from "../lib/authz";

function requireOrgId(identity: any) {
  const orgId = identity?.orgId as string | undefined;
  if (!orgId) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Organization not found",
    });
  }
  return orgId;
}

const ThemeV = v.object({
  primaryColor: v.optional(v.string()),
  primaryTextColor: v.optional(v.string()),
  secondaryColor: v.optional(v.string()),
  secondaryTextColor: v.optional(v.string()),
  nudgeBackgroundColor: v.optional(v.string()),
  chatBubbleColor: v.optional(v.string()),
});

const ConsentV = v.object({
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
});

const DefaultSuggestionsV = v.object({
  suggestion1: v.optional(v.string()),
  suggestion2: v.optional(v.string()),
  suggestion3: v.optional(v.string()),
});

const VapiSettingsV = v.object({
  assistantId: v.optional(v.string()),
  phoneNumber: v.optional(v.string()),
  voiceButtonEnabled: v.optional(v.boolean()),
});

const RoutingModeV = v.union(
  v.literal("auto_assign"),
  v.literal("visitor_choice"),
);

const EmbedLayoutV = v.union(
  v.literal("compact"),
  v.literal("full_width_bottom"),
);

const WidgetUiLanguageV = v.union(v.literal("en"), v.literal("fr"));

const KnowledgeModeV = v.union(
  v.literal("llm_only"),
  v.literal("llm_plus_kb"),
  v.literal("kb_only"),
);

const LlmProviderV = v.union(
  v.literal("openai"),
  v.literal("google"),
  v.literal("anthropic")
);

export const upsert = mutation({
  args: {
    // ✅ Tout devient optionnel → PATCH friendly
    greetMessage: v.optional(v.string()),
    defaultSuggestions: v.optional(DefaultSuggestionsV),

    teamAvatars: v.optional(v.array(v.string())),
    brandLogoUrl: v.optional(v.string()),
    theme: v.optional(ThemeV),

    privacyUrl: v.optional(v.string()),
    consent: v.optional(ConsentV),

    routingMode: v.optional(RoutingModeV),
    embedLayout: v.optional(EmbedLayoutV),
    knowledgeMode: v.optional(KnowledgeModeV),

    // ✅ NEW: LLM selection
    llmProvider: v.optional(LlmProviderV),
    llmModel: v.optional(v.string()),

    // ✅ voice settings
    vapiSettings: v.optional(VapiSettingsV),

    escalationSuggestionAfterMessages: v.optional(v.number()),

    playbookPresetId: v.optional(v.string()),

    whatsappHandoffEnabled: v.optional(v.boolean()),
    whatsappPhoneDigits: v.optional(v.string()),
    whatsappUseAssignedRepFirst: v.optional(v.boolean()),
    whatsappPrefillTemplate: v.optional(v.string()),

    widgetUiLanguage: v.optional(WidgetUiLanguageV),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgManager(ctx);

    // Plan gating: Starter must use OpenAI (Growth/Enterprise can choose).
    const sub = await ctx.runQuery(internal.system.subscriptions.getByOrganizationId, {
      organizationId: orgId,
    });
    const plan = (sub?.plan ?? "starter") as "starter" | "growth" | "enterprise";
    const status = (sub?.status ?? "paused") as string;
    const isActive = status === "active" || status === "trial";
    const canChooseProvider = isActive && (plan === "growth" || plan === "enterprise");

    const existing = await ctx.db
      .query("widgetSettings")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    // Build patch ONLY from provided keys
    const patch: Record<string, any> = {};

    if ("greetMessage" in args) patch.greetMessage = args.greetMessage;
    if ("defaultSuggestions" in args)
      patch.defaultSuggestions = args.defaultSuggestions;

    if ("teamAvatars" in args) patch.teamAvatars = args.teamAvatars;
    if ("brandLogoUrl" in args) patch.brandLogoUrl = args.brandLogoUrl;
    if ("theme" in args) patch.theme = args.theme;

    if ("privacyUrl" in args) patch.privacyUrl = args.privacyUrl;
    if ("consent" in args) patch.consent = args.consent;

    if ("routingMode" in args) patch.routingMode = args.routingMode;
    if ("embedLayout" in args) patch.embedLayout = args.embedLayout;
    if ("knowledgeMode" in args) patch.knowledgeMode = args.knowledgeMode;

    if ("llmProvider" in args) patch.llmProvider = args.llmProvider;
    if ("llmModel" in args) patch.llmModel = args.llmModel;

    if (!canChooseProvider) {
      // Force OpenAI for Starter / inactive orgs.
      if ("llmProvider" in patch) patch.llmProvider = "openai";
      if ("llmModel" in patch) patch.llmModel = patch.llmModel; // keep whatever model string, but provider stays openai
    }

    if ("vapiSettings" in args) patch.vapiSettings = args.vapiSettings;
    if ("escalationSuggestionAfterMessages" in args)
      patch.escalationSuggestionAfterMessages = args.escalationSuggestionAfterMessages;

    if ("playbookPresetId" in args) patch.playbookPresetId = args.playbookPresetId;

    if ("whatsappHandoffEnabled" in args)
      patch.whatsappHandoffEnabled = args.whatsappHandoffEnabled;
    if ("whatsappPhoneDigits" in args) patch.whatsappPhoneDigits = args.whatsappPhoneDigits;
    if ("whatsappUseAssignedRepFirst" in args)
      patch.whatsappUseAssignedRepFirst = args.whatsappUseAssignedRepFirst;
    if ("whatsappPrefillTemplate" in args)
      patch.whatsappPrefillTemplate = args.whatsappPrefillTemplate;

    if ("widgetUiLanguage" in args) patch.widgetUiLanguage = args.widgetUiLanguage;

    // If no record yet, insert minimal required fields
    if (!existing) {
      const id = await ctx.db.insert("widgetSettings", {
        organizationId: orgId,
        greetMessage: patch.greetMessage ?? "",
        defaultSuggestions:
          patch.defaultSuggestions ?? {
            suggestion1: undefined,
            suggestion2: undefined,
            suggestion3: undefined,
          },
        teamAvatars: patch.teamAvatars,
        brandLogoUrl: patch.brandLogoUrl,
        theme: patch.theme,
        privacyUrl: patch.privacyUrl,
        consent: patch.consent,
        routingMode: patch.routingMode,
        embedLayout: patch.embedLayout,
        knowledgeMode: patch.knowledgeMode,
        llmProvider: patch.llmProvider,
        llmModel: patch.llmModel,
        vapiSettings: patch.vapiSettings,
        whatsappHandoffEnabled: patch.whatsappHandoffEnabled,
        whatsappPhoneDigits: patch.whatsappPhoneDigits,
        whatsappUseAssignedRepFirst: patch.whatsappUseAssignedRepFirst,
        whatsappPrefillTemplate: patch.whatsappPrefillTemplate,
        widgetUiLanguage: patch.widgetUiLanguage,
      });
      return id;
    }

    // Ensure required fields never become undefined by accident
    if ("greetMessage" in patch && patch.greetMessage === undefined) {
      patch.greetMessage = existing.greetMessage;
    }
    if ("defaultSuggestions" in patch && patch.defaultSuggestions === undefined) {
      patch.defaultSuggestions = existing.defaultSuggestions;
    }

    await ctx.db.patch(existing._id, patch);
    return existing._id;
  },
});

export const getOne = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = requireOrgId(identity);

    return await ctx.db
      .query("widgetSettings")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();
  },
});

export const setRoutingMode = mutation({
  args: { routingMode: RoutingModeV },
  handler: async (ctx, { routingMode }) => {
    const { orgId } = await requireOrgManager(ctx);

    const existing = await ctx.db
      .query("widgetSettings")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { routingMode });
      return existing._id;
    }

    return await ctx.db.insert("widgetSettings", {
      organizationId: orgId,
      greetMessage: "",
      defaultSuggestions: {
        suggestion1: undefined,
        suggestion2: undefined,
        suggestion3: undefined,
      },
      routingMode,
    });
  },
});

export const setKnowledgeMode = mutation({
  args: { knowledgeMode: KnowledgeModeV },
  handler: async (ctx, { knowledgeMode }) => {
    const { orgId } = await requireOrgManager(ctx);

    const existing = await ctx.db
      .query("widgetSettings")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { knowledgeMode });
      return existing._id;
    }

    return await ctx.db.insert("widgetSettings", {
      organizationId: orgId,
      greetMessage: "",
      defaultSuggestions: {
        suggestion1: undefined,
        suggestion2: undefined,
        suggestion3: undefined,
      },
      knowledgeMode,
    });
  },
});
