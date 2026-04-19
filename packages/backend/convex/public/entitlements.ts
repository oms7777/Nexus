// packages/backend/convex/public/entitlements.ts
import { query } from "../_generated/server";
import { ConvexError, v } from "convex/values";

type Plan = "starter" | "growth" | "enterprise";

function computeEntitlements(sub: any) {
  const plan: Plan = (sub?.plan ?? "starter") as Plan;
  const status: string = (sub?.status ?? "paused") as string;

  const isActive = status === "active" || status === "trial";
  const addons = sub?.addons ?? {};
  const limits = sub?.limits ?? {};

  const canUseSlack = isActive && (plan === "growth" || plan === "enterprise");
  const canUseSalesforce = isActive && plan !== "starter" && addons.salesforce === true;
  const canUseHubspot = isActive && plan !== "starter" && addons.hubspot === true;

  const voiceEnabled = addons.voice === true;
  const canUseVoice = isActive && voiceEnabled;

  const canUseAdvancedRouting = isActive && (plan === "growth" || plan === "enterprise");
  const canUseAdvancedPromos = isActive && (plan === "growth" || plan === "enterprise");
  const canUseAdvancedAnalytics = isActive && addons.advancedAnalytics === true;
  const canChooseLlmProvider = isActive && (plan === "growth" || plan === "enterprise");

  const canUseBooking = isActive;

  const salesforcePlus = addons.salesforcePlus === true;
  const hubspotPlus = addons.hubspotPlus === true;
  const voicePlus = addons.voicePlus === true;

  /** BYO configuration UI (OAuth app / own Vapi keys). Easy-connect uses Inboundless env without this. */
  const canConfigureSalesforceByo = isActive && canUseSalesforce && salesforcePlus;
  const canConfigureHubspotByo = isActive && canUseHubspot && hubspotPlus;
  const canConfigureVoiceByo = isActive && canUseVoice && voicePlus;

  const effectiveWebsites = Number(limits.websites ?? 0) + Number(addons.extraWebsites ?? 0);
  const effectiveReps = Number(limits.reps ?? 0);

  return {
    plan,
    status,
    isActive,
    addons,
    limits,
    effectiveLimits: {
      websites: effectiveWebsites,
      reps: effectiveReps,
      monthlyEvents: Number(limits.monthlyEvents ?? 0),
      aiTokens: Number(limits.aiTokens ?? 0),
      voiceMinutes: Number(limits.voiceMinutes ?? 0),
      snapshotsGb: Number(limits.snapshotsGb ?? 0),
    },
    features: {
      canUseSlack,
      canUseSalesforce,
      canUseHubspot,
      canUseVoice,
      canUseAdvancedRouting,
      canUseAdvancedPromos,
      canUseAdvancedAnalytics,
      canUseBooking,
      canChooseLlmProvider,
      canConfigureSalesforceByo,
      canConfigureHubspotByo,
      canConfigureVoiceByo,
    },
  };
}

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = identity?.orgId as string | undefined;
    if (!orgId) throw new ConvexError({ code: "UNAUTHORIZED", message: "No org" });

    return await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();
  },
});

export const getEntitlements = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = identity?.orgId as string | undefined;
    if (!orgId) throw new ConvexError({ code: "UNAUTHORIZED", message: "No org" });

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    return computeEntitlements(sub ?? { plan: "starter", status: "paused", addons: {}, limits: {} });
  },
});

// ✅ Public minimal plan for widget (no auth)
export const getPublicPlan = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    const plan: Plan = (sub?.plan ?? "starter") as Plan;
    const status: string = (sub?.status ?? "paused") as string;
    const isActive = status === "active" || status === "trial";
    const canUseAdvancedPromos = isActive && (plan === "growth" || plan === "enterprise");
    const canChooseLlmProvider = isActive && (plan === "growth" || plan === "enterprise");

    const voiceEnabled = sub?.addons?.voice === true;
    const canUseVoice = isActive && voiceEnabled;

    return { plan, status, isActive, canUseAdvancedPromos, canUseVoice, canChooseLlmProvider };
  },
});
