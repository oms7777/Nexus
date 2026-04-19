// apps/web/modules/entitlements/hooks/use-entitlements.ts
"use client";

import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

export type Plan = "starter" | "growth" | "enterprise";

export function useEntitlements() {
  const ent = useQuery(api.public.entitlements.getEntitlements, {});
  const isLoading = ent === undefined;

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

    features: ent?.features ?? {
      canUseSlack: false,
      canUseSalesforce: false,
      canUseHubspot: false,
      canUseVoice: false,
      canUseAdvancedRouting: false,
      canUseAdvancedPromos: false,
      canUseAdvancedAnalytics: false,
      canUseBooking: false,
    },

    // helpers UI (optionnel)
    canUseSlack: ent?.features?.canUseSlack ?? false,
    canUseSalesforce: ent?.features?.canUseSalesforce ?? false,
    canUseHubspot: ent?.features?.canUseHubspot ?? false,
    canUseVoice: ent?.features?.canUseVoice ?? false,
  };
}
