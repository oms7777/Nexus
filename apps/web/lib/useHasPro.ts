"use client";

import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

export function useHasPro() {
  const res = useQuery(api.private.billing.isPro); // returns { isPro: boolean } or undefined (loading)
  return {
    isPro: !!res?.isPro,
    loading: res === undefined,
  };
}
