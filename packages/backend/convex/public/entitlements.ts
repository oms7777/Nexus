// packages/backend/convex/public/entitlements.ts
import { query } from "../_generated/server";
import { ConvexError } from "convex/values";

type Plan = "starter" | "growth" | "enterprise";

function computeEntitlements(sub: any) {
  const plan: Plan = (sub?.plan ?? "starter") as Plan;
  const status: string = (sub?.status ?? "paused") as string;

  // On considère "actif" si active ou trial (best-effort Starter/Growth, contractuel Enterprise, mais accès produit OK)
  const isActive = status === "active" || status === "trial";

  // addons/limits sont NON-OPTIONAL dans ton schema, mais on sécurise
  const addons = sub?.addons ?? {};
  const limits = sub?.limits ?? {};

  // ---- Rules pricing (STRICT, sans invention) ----
  // Slack: inclus Growth+ uniquement
  const canUseSlack = isActive && (plan === "growth" || plan === "enterprise");

  // Salesforce: ADD-ON uniquement, et JAMAIS en starter même si flag (hard block)
  // Growth: addon seulement
  // Enterprise: "possible" => addon seulement (contrôle contractuel)
  const canUseSalesforce = isActive && plan !== "starter" && addons.salesforce === true;

  // Voice: add-on (pas dans scope ici mais on le calcule quand même)
  const canUseVoice = isActive && addons.voiceAi === true;

  // Routing avancé: Growth+
  const canUseAdvancedRouting = isActive && (plan === "growth" || plan === "enterprise");

  // Promos avancées: Growth+
  const canUseAdvancedPromos = isActive && (plan === "growth" || plan === "enterprise");

  // Analytics avancées (de base) : Growth+ (exec = addon advancedAnalytics, plus tard)
  const canUseAdvancedAnalytics = isActive && addons.advancedAnalytics === true;


  // Booking: ton pricing dit "1 calendar" en Starter (et Growth aussi par défaut)
  // Ici on ne gère pas multi-calendar encore, donc on expose juste un flag "canUseBooking"
  const canUseBooking = isActive; // booking existe sur tous les plans

  // Effective limits (limits + add-ons quantitatifs)
  const effectiveWebsites = Number(limits.websites ?? 0) + Number(addons.extraWebsites ?? 0);
  const effectiveReps = Number(limits.reps ?? 0) + Number(addons.extraReps ?? 0);

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
      canUseVoice,

      canUseAdvancedRouting,
      canUseAdvancedPromos,
      canUseAdvancedAnalytics,

      canUseBooking,
    },
  };
}

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = identity?.orgId as string | undefined;

    if (!orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "No org" });
    }

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    return sub; // null si pas créé
  },
});

// ✅ NEW: computed entitlements (source de vérité)
export const getEntitlements = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = identity?.orgId as string | undefined;

    if (!orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "No org" });
    }

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    // Si pas de sub => on renvoie une vue "paused starter" (safe)
    return computeEntitlements(sub ?? { plan: "starter", status: "paused", addons: {}, limits: {} });
  },
});
