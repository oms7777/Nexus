"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useAtomValue, useSetAtom } from "jotai";
import {
  organizationIdAtom,
  screenAtom,
  conversationIdAtom,
  contactSessionIdAtom,
} from "../../atoms/widget-atoms";
import {
  bookingIntentAtom,
  qualifyStepAtom,
  consentGivenAtom,
} from "../../atoms/qualify-atoms";
import type { Doc, Id } from "@workspace/backend/_generated/dataModel";

type Cta = Doc<"promos">["primaryCta"];

type ThemePayload = {
  primaryColor?: string;
  primaryTextColor?: string;
  secondaryColor?: string;
  secondaryTextColor?: string;
  nudgeBackgroundColor?: string;
  chatBubbleColor?: string;
};

type SuggestionsPayload = {
  greetMessage?: string;
  suggestions: string[];
  privacyUrl?: string;
  theme?: ThemePayload;
  brandLogoUrl?: string;
  canUseVoice?: boolean;
};

export default function SmartPromo() {
  const orgId = useAtomValue(organizationIdAtom);

  const setScreen = useSetAtom(screenAtom);
  const setBookingIntent = useSetAtom(bookingIntentAtom);
  const setStep = useSetAtom(qualifyStepAtom);
  const setConversationId = useSetAtom(conversationIdAtom);

  const consentGiven = useAtomValue(consentGivenAtom);
  const currentConvId = useAtomValue(conversationIdAtom);

  const contactSessionId = useAtomValue(contactSessionIdAtom);
  const setContactSessionId = useSetAtom(contactSessionIdAtom);

  const ensureContactSession = useMutation(api.public.contactSessions.ensure);
  const createConversation = useMutation(api.public.conversations.create);

  const isEmbedded =
    typeof window !== "undefined" ? window.parent !== window : false;

  // ✅ NEW: parent URL comes from embed.ts via postMessage
  const [parentHref, setParentHref] = useState<string | null>(null);

  useEffect(() => {
    if (!isEmbedded) return;

    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type as string | undefined;

      // embed.ts sends this reliably even if Referrer-Policy strips path
      if (t === "nexus:parent-location") {
        const href = e.data?.href;
        if (typeof href === "string" && href.trim().length > 0) {
          setParentHref(href);
        }
      }
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [isEmbedded]);

  // ---- DATA
  const ws = useQuery(
    api.public.widgetSettings.getByOrganizationId,
    orgId ? { organizationId: orgId } : "skip",
  );

  const publicPlan = useQuery(
    api.public.entitlements.getPublicPlan,
    orgId ? { organizationId: orgId } : "skip",
  );

  const planReady = publicPlan !== undefined && publicPlan !== null;

  const canUseAdvancedPromos = !!(publicPlan as any)?.canUseAdvancedPromos;
  const canUseVoice = !!(publicPlan as any)?.canUseVoice;

  const planName = (publicPlan as any)?.plan as
    | "starter"
    | "growth"
    | "enterprise"
    | undefined;

  const isStarterPlan = planName === "starter";

  const memberAvatars =
    useQuery(
      api.public.users.listOrgAvatars,
      orgId ? { organizationId: orgId, limit: 3 } : "skip",
    ) ?? [];

  // ✅ FIX: use parentHref first, fallback to referrer (best effort), else window.href
  const currentUrl =
    typeof window !== "undefined"
      ? parentHref ||
        (isEmbedded ? document.referrer || undefined : window.location.href)
      : undefined;

  const utm =
    typeof window !== "undefined" && currentUrl
      ? new URL(currentUrl).searchParams.get("utm_source") || undefined
      : undefined;

  // ✅ IMPORTANT: only query promos when we have a usable URL
  const promos =
    useQuery(
      api.public.promos.listForPage,
      planReady && canUseAdvancedPromos && orgId && currentUrl
        ? { organizationId: orgId, currentUrl, utmSource: utm }
        : "skip",
    ) ?? [];

  const promo: Doc<"promos"> | undefined = useMemo(
    () => (Array.isArray(promos) && promos.length ? promos[0] : undefined),
    [promos],
  );

  const promoRef = useRef<Doc<"promos"> | undefined>(undefined);
  useEffect(() => {
    promoRef.current = promo;
  }, [promo]);

  const ensureAndStart = async (intent: "chat" | "book") => {
    if (!orgId) {
      setScreen("error");
      return;
    }

    setBookingIntent(intent);

    const nextStep =
      consentGiven ? (intent === "book" ? "ask_name" : "idle") : "consent";

    setStep(nextStep as any);
    setScreen("chat");

    let sessionId: Id<"contactSessions"> | null = null;
    try {
      sessionId =
        (contactSessionId as any) ||
        ((await ensureContactSession({ organizationId: orgId })) as any);

      if (!contactSessionId && sessionId) setContactSessionId(sessionId as any);
    } catch {
      return;
    }

    if (currentConvId) return;

    try {
      const created = await createConversation({
        contactSessionId: sessionId!,
        organizationId: orgId,
        suppressGreet: intent === "book" ? true : undefined,
      } as any);

      const newConversationId =
        typeof created === "string"
          ? (created as Id<"conversations">)
          : created.conversationId;

      setConversationId(newConversationId);
    } catch {}
  };

  const runCta = async (cta: Cta) => {
    if (cta.kind === "open_chat") return ensureAndStart("chat");
    if (cta.kind === "open_booking") return ensureAndStart("book");
    if (cta.kind === "open_url" && cta.url) {
      window.open(cta.url, "_blank", "noopener,noreferrer");
    }
  };

  // listen commands (existing)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type as string | undefined;

      if (t === "nexus:open-chat") {
        void ensureAndStart("chat");
        return;
      }

      if (t === "nexus:run-primary-cta") {
        const p = promoRef.current;
        void (p?.primaryCta ? runCta(p.primaryCta) : ensureAndStart("chat"));
        return;
      }

      if (t === "nexus:run-secondary-cta") {
        const p = promoRef.current;
        void (p?.secondaryCta ? runCta(p.secondaryCta) : ensureAndStart("book"));
        return;
      }

      if (t === "nexus:run-cta" && typeof e.data.index === "number") {
        const idx = e.data.index as number;
        const p = promoRef.current;

        if (!p) {
          void ensureAndStart("chat");
          return;
        }

        const list = (p as any).ctaList as Cta[] | undefined;
        const fromList = list && list[idx];
        if (fromList) {
          void runCta(fromList);
          return;
        }

        if (idx === 0 && p.primaryCta) return void runCta(p.primaryCta);
        if (idx === 1 && p.secondaryCta) return void runCta(p.secondaryCta);

        void ensureAndStart("chat");
      }
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, consentGiven, contactSessionId, currentConvId]);

  const makePromoPayload = () => {
    if (!promo) return null;

    const avatars: string[] =
      (Array.isArray(memberAvatars) && memberAvatars.length
        ? memberAvatars
        : (ws as any)?.teamAvatars?.slice?.(0, 3)) || [];

    const privacyUrl =
      (ws as any)?.consent?.privacyUrl || (ws as any)?.privacyUrl || undefined;

    const theme: ThemePayload | undefined = (ws as any)?.theme;
    const brandLogoUrl: string | undefined = (ws as any)?.brandLogoUrl;

    const ctaList = (promo as any).ctaList as Cta[] | undefined;
    const simpleCtaList =
      ctaList && ctaList.length
        ? ctaList.map((c) => ({ kind: c.kind, label: c.label, url: c.url }))
        : undefined;

    return {
      title: promo.card?.title,
      body: promo.card?.body,
      primary: promo.primaryCta?.label,
      secondary: promo.secondaryCta?.label,
      primaryCta: promo.primaryCta,
      secondaryCta: promo.secondaryCta,
      avatars,
      badgeText: promo.card?.badgeText || undefined,
      privacyUrl,
      theme,
      brandLogoUrl,
      identityMode: promo.identityMode ?? "auto",
      ctaList: simpleCtaList,
      canUseVoice,
    };
  };

  const makeSuggestionsPayload = (): SuggestionsPayload | null => {
    if (!ws) return null;

    const theme: ThemePayload | undefined = (ws as any)?.theme;
    const brandLogoUrl: string | undefined = (ws as any)?.brandLogoUrl;

    const privacyUrl =
      (ws as any)?.consent?.privacyUrl || (ws as any)?.privacyUrl || undefined;

    const greetMessage: string | undefined = (ws as any)?.greetMessage;

    const s1 = (ws as any)?.defaultSuggestions?.suggestion1?.trim();
    const s2 = (ws as any)?.defaultSuggestions?.suggestion2?.trim();
    const s3 = (ws as any)?.defaultSuggestions?.suggestion3?.trim();

    const suggestions = [s1, s2, s3].filter(Boolean) as string[];
    if (!suggestions.length) return null;

    return {
      greetMessage,
      suggestions,
      privacyUrl,
      theme,
      brandLogoUrl,
      canUseVoice,
    };
  };

  // ✅ Send flags (reset when org changes)
  const sentPromoRef = useRef(false);
  const sentSuggestionsRef = useRef(false);
  useEffect(() => {
    sentPromoRef.current = false;
    sentSuggestionsRef.current = false;
  }, [orgId]);

  // ✅ SEND PROMO (Growth/Enterprise ONLY, and only if promo exists)
  useEffect(() => {
    if (!isEmbedded) return;
    if (!planReady) return;
    if (!canUseAdvancedPromos) return;
    if (sentPromoRef.current) return;

    const payload = makePromoPayload();
    if (!payload) return;

    sentPromoRef.current = true;
    window.parent?.postMessage({ type: "nexus:promo", payload }, "*");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEmbedded,
    planReady,
    canUseAdvancedPromos,
    promo,
    memberAvatars,
    ws,
    canUseVoice,
  ]);

  // ✅ SEND SUGGESTIONS (Starter ONLY)
  useEffect(() => {
    if (!isEmbedded) return;
    if (!planReady) return;
    if (!isStarterPlan) return;
    if (sentSuggestionsRef.current) return;

    const payload = makeSuggestionsPayload();
    if (!payload) return;

    sentSuggestionsRef.current = true;
    window.parent?.postMessage({ type: "nexus:suggestions", payload }, "*");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmbedded, planReady, isStarterPlan, ws, canUseVoice]);

  // Internal preview unchanged
  const showInternal = !!promo && !isEmbedded && canUseAdvancedPromos;
  if (!showInternal) return null;

  return null;
}
