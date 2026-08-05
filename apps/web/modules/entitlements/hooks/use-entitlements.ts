// apps/web/modules/entitlements/hooks/use-entitlements.ts
"use client";

import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

export type Plan = "starter" | "growth" | "enterprise";

export type EntitlementFeatures = {
  canUseSlack: boolean;
  canUseSalesforce: boolean;
  canUseHubspot: boolean;
  canUseCrmRevenue: boolean;
  canUseVoice: boolean;
  canUseAdvancedRouting: boolean;
  canUseAdvancedPromos: boolean;
  canUseAdvancedAnalytics: boolean;
  canUseBooking: boolean;
  canChooseLlmProvider: boolean;
  canConfigureSalesforceByo: boolean;
  canConfigureHubspotByo: boolean;
  canConfigureVoiceByo: boolean;
};

const EMPTY_FEATURES: EntitlementFeatures = {
  canUseSlack: false,
  canUseSalesforce: false,
  canUseHubspot: false,
  canUseCrmRevenue: false,
  canUseVoice: false,
  canUseAdvancedRouting: false,
  canUseAdvancedPromos: false,
  canUseAdvancedAnalytics: false,
  canUseBooking: false,
  canChooseLlmProvider: false,
  canConfigureSalesforceByo: false,
  canConfigureHubspotByo: false,
  canConfigureVoiceByo: false,
};

export function useEntitlements() {
  const ent = useQuery(api.public.entitlements.getEntitlements, {});
  const isLoading = ent === undefined;

  const features: EntitlementFeatures = {
    ...EMPTY_FEATURES,
    ...(ent?.features ?? {}),
    // Older clients / cached shapes may omit this flag — derive from CRM add-ons.
    canUseCrmRevenue:
      Boolean((ent?.features as EntitlementFeatures | undefined)?.canUseCrmRevenue) ||
      Boolean(ent?.features?.canUseSalesforce) ||
      Boolean(ent?.features?.canUseHubspot),
  };

  return {
    // raw
    ent,
    isLoading,

    // convenience
    plan: (ent?.plan ?? "starter") as Plan,
    status: ent?.status ?? "paused",
    isActive: ent?.isActive ?? false,

    addons: ent?.addons ?? {},
    limits: ent?.limits ?? {},
    effectiveLimits: ent?.effectiveLimits ?? {
      websites: 0,
      reps: 0,
      monthlyEvents: 0,
      aiTokens: 0,
      voiceMinutes: 0,
      snapshotsGb: 0,
    },

    features,

    // helpers UI (optionnel)
    canUseSlack: features.canUseSlack,
    canUseSalesforce: features.canUseSalesforce,
    canUseHubspot: features.canUseHubspot,
    canUseCrmRevenue: features.canUseCrmRevenue,
    canUseVoice: features.canUseVoice,
  };
}
