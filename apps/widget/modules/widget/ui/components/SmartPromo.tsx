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
  nudgeDisplay?: {
    countPerPage?: number;
    showDelayAfterNavMs?: number;
    minDelayMs?: number;
    autoCloseMs?: number;
    betweenPopupsMs?: number;
  };
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

  // ✅ Parent URL provided by embed.ts via postMessage
  const [parentHref, setParentHref] = useState<string | null>(null);

  useEffect(() => {
    if (!isEmbedded) return;

    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type as string | undefined;
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

  /**
   * ✅ IMPORTANT:
   * In embedded mode, DO NOT use document.referrer fallback.
   * Wait for parentHref so we always have the real pathname (/pricing, etc.)
   */
  const currentUrl =
    typeof window !== "undefined"
      ? isEmbedded
        ? parentHref || undefined
        : window.location.href
      : undefined;

  // ✅ Promos: only query when we have the true URL in embedded mode
  const promos =
    useQuery(
      api.public.promos.listForPage,
      planReady && canUseAdvancedPromos && orgId && currentUrl
        ? { organizationId: orgId, currentUrl }
        : "skip",
    ) ?? [];

  // Starter-only: nudge suggestions can be configured per page.
  const pageNudge =
    useQuery(
      (api.public as any).nudges.getForPage,
      planReady && isStarterPlan && orgId && currentUrl
        ? { organizationId: orgId, currentUrl }
        : "skip",
    ) ?? null;

  const matchedPromos: Doc<"promos">[] = useMemo(
    () => (Array.isArray(promos) ? (promos as Doc<"promos">[]) : []),
    [promos],
  );
  const promo: Doc<"promos"> | undefined = matchedPromos[0];

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

    // Soft consent: we only show the legal text, no blocking card
    const nextStep = intent === "book" ? "ask_name" : "idle";
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

  // listen commands
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

  const makePromoPayload = (promoDoc: Doc<"promos">) => {

    const avatars: string[] =
      (Array.isArray(memberAvatars) && memberAvatars.length
        ? memberAvatars
        : (ws as any)?.teamAvatars?.slice?.(0, 3)) || [];

    const privacyUrl =
      (ws as any)?.consent?.privacyUrl || (ws as any)?.privacyUrl || undefined;

    const theme: ThemePayload | undefined = (ws as any)?.theme;
    const brandLogoUrl: string | undefined = (ws as any)?.brandLogoUrl;

    const ctaList = (promoDoc as any).ctaList as Cta[] | undefined;
    const simpleCtaList =
      ctaList && ctaList.length
        ? ctaList.map((c) => ({ kind: c.kind, label: c.label, url: c.url }))
        : undefined;

    return {
      title: promoDoc.card?.title,
      body: promoDoc.card?.body,
      imageUrl: (promoDoc as any)?.card?.imageUrl,
      videoUrl: (promoDoc as any)?.card?.videoUrl,
      videoPosterUrl: (promoDoc as any)?.card?.videoPosterUrl,
      primary: promoDoc.primaryCta?.label,
      secondary: promoDoc.secondaryCta?.label,
      primaryCta: promoDoc.primaryCta,
      secondaryCta: promoDoc.secondaryCta,
      avatars,
      badgeText: promoDoc.card?.badgeText || undefined,
      privacyUrl,
      theme,
      brandLogoUrl,
      identityMode: promoDoc.identityMode ?? "auto",
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

    // Base suggestions from widget settings
    const base1 = (ws as any)?.defaultSuggestions?.suggestion1?.trim();
    const base2 = (ws as any)?.defaultSuggestions?.suggestion2?.trim();
    const base3 = (ws as any)?.defaultSuggestions?.suggestion3?.trim();

    // Optional override from per-page nudge configuration
    const s1 = (pageNudge as any)?.suggestions?.suggestion1?.trim() ?? base1;
    const s2 = (pageNudge as any)?.suggestions?.suggestion2?.trim() ?? base2;
    const s3 = (pageNudge as any)?.suggestions?.suggestion3?.trim() ?? base3;

    const suggestions = [s1, s2, s3].filter(Boolean) as string[];
    if (!suggestions.length) return null;

    const settings = (pageNudge as any)?.settings;
    const nudgeDisplay =
      settings && typeof settings === "object"
        ? {
            countPerPage: settings.sequenceCount,
            showDelayAfterNavMs: settings.showDelayAfterNavMs,
            minDelayMs: settings.minDelayMs,
            autoCloseMs: settings.autoCloseMs,
            betweenPopupsMs: settings.betweenPopupsMs,
          }
        : undefined;

    return {
      greetMessage,
      suggestions,
      privacyUrl,
      theme,
      brandLogoUrl,
      canUseVoice,
      nudgeDisplay,
    };
  };

  /**
   * ✅ Send when promo changes (instead of "only once")
   */
  const lastSentPromoKeyRef = useRef<string | null>(null);
  const lastSentSuggestionsKeyRef = useRef<string | null>(null);

  // Reset when org changes
  useEffect(() => {
    lastSentPromoKeyRef.current = null;
    lastSentSuggestionsKeyRef.current = null;
  }, [orgId]);

  // ✅ SEND PROMO when it changes (Growth/Enterprise only)
  useEffect(() => {
    if (!isEmbedded) return;
    if (!planReady) return;
    if (!canUseAdvancedPromos) return;

    // In embedded mode, wait for parentHref so targeting works
    if (!currentUrl) return;

    if (!matchedPromos.length) return;

    const items = matchedPromos.map((p) => makePromoPayload(p));
    const firstSettings = (matchedPromos[0] as any)?.settings ?? {};

    const sequenceSettings = {
      sequenceEnabled: firstSettings.sequenceEnabled ?? true,
      showDelayAfterNavMs: firstSettings.showDelayAfterNavMs ?? 2500,
      autoCloseMs: firstSettings.autoCloseMs ?? 4500,
      betweenPopupsMs: firstSettings.betweenPopupsMs ?? 10000,
      maxSequenceItems: firstSettings.maxSequenceItems ?? 3,
      animationPreset: firstSettings.animationPreset ?? "soft_slide",
    };

    const key = [
      items.map((x) => `${x.title || ""}:${x.body || ""}`).join("|"),
      JSON.stringify(sequenceSettings),
    ].join("__");

    if (lastSentPromoKeyRef.current === key) return;
    lastSentPromoKeyRef.current = key;

    window.parent?.postMessage(
      { type: "nexus:promo-sequence", payload: { items, settings: sequenceSettings } },
      "*",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmbedded, planReady, canUseAdvancedPromos, currentUrl, matchedPromos, memberAvatars, ws, canUseVoice]);

  // ✅ SEND SUGGESTIONS (Starter only) when the page-specific config changes
  useEffect(() => {
    if (!isEmbedded) return;
    if (!planReady) return;
    if (!isStarterPlan) return;

    const payload = makeSuggestionsPayload();
    if (!payload) return;

    const key = [
      payload.suggestions.join("|"),
      JSON.stringify(payload.nudgeDisplay ?? {}),
    ].join("__");

    if (lastSentSuggestionsKeyRef.current === key) return;
    lastSentSuggestionsKeyRef.current = key;

    window.parent?.postMessage({ type: "nexus:suggestions", payload }, "*");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmbedded, planReady, isStarterPlan, ws, canUseVoice, currentUrl, pageNudge]);

  // Internal preview unchanged
  const showInternal = !!promo && !isEmbedded && canUseAdvancedPromos;
  if (!showInternal) return null;

  return null;
}
