"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useAtomValue, useSetAtom } from "jotai";
import { getOrCreateExternalSessionId } from "../../../../lib/external-session";
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

type CtaEmphasisMode =
  | "first_primary"
  | "last_primary"
  | "all_primary"
  | "none_primary";

type NudgeSize = "sm" | "md" | "lg" | "xl";
type MediaPlacement = "top" | "bottom" | "left" | "right" | "framed";
type MediaHeight = "compact" | "standard" | "tall" | "hero";

type NudgeContentBlockPayload =
  | { type: "text"; id: string; text: string; align?: "left" | "center" | "right" }
  | { type: "image"; id: string; url: string }
  | { type: "video"; id: string; url: string };

type PromoEmbedItem = {
  title?: string;
  body?: string;
  imageUrl?: string;
  videoUrl?: string;
  primary?: string;
  secondary?: string;
  primaryCta?: Cta;
  secondaryCta?: Cta;
  avatars: string[];
  privacyUrl?: string;
  theme?: ThemePayload;
  brandLogoUrl?: string;
  identityMode?: "auto" | "logo" | "avatars";
  ctaList?: { kind: string; label: string; url?: string }[];
  canUseVoice?: boolean;
  /** Host-page nudge width tier. */
  nudgeSize?: NudgeSize;
  /** Image/video strip height tier. */
  mediaHeight?: MediaHeight;
  /** Image/video position relative to text. */
  mediaPlacement?: MediaPlacement;
  /** Ordered content blocks (plain text + http(s) media). */
  contentBlocks?: NudgeContentBlockPayload[];
};

function primaryIndexForEmphasis(mode: CtaEmphasisMode | undefined, len: number) {
  if (!len) return 0;
  const m = mode ?? "first_primary";
  if (m === "last_primary") return Math.max(0, len - 1);
  return 0;
}

/** Per-step CTA list overrides promo-level CTAs when non-empty. */
function mergeStepCtas(
  base: PromoEmbedItem,
  promoDoc: Doc<"promos">,
  step: {
    ctaList?: Cta[] | null;
    ctaEmphasisMode?: CtaEmphasisMode | null;
  },
): PromoEmbedItem {
  const stepList = (Array.isArray(step?.ctaList) ? step.ctaList : []).filter(
    (c): c is Cta => !!c && typeof c.label === "string" && c.label.trim().length > 0,
  );
  if (!stepList.length) return base;

  const mode = (step.ctaEmphasisMode ?? promoDoc.ctaEmphasisMode ?? "first_primary") as CtaEmphasisMode;
  const pi = primaryIndexForEmphasis(mode, stepList.length);
  const primaryCta = stepList[pi] ?? stepList[0]!;
  const secondaryCta =
    stepList.length > 1 ? stepList.find((_, i) => i !== pi) : undefined;

  return {
    ...base,
    primary: primaryCta.label,
    secondary: secondaryCta?.label,
    primaryCta,
    secondaryCta,
    ctaList: stepList.map((c) => ({ kind: c.kind, label: c.label, url: c.url })),
  };
}

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
  const ensureContactSessionByExternal = useMutation(api.public.contactSessions.ensureByExternalId);
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
      const externalSessionId = getOrCreateExternalSessionId();
      sessionId =
        (contactSessionId as any) ||
        ((await ensureContactSessionByExternal({
          organizationId: orgId,
          externalSessionId,
        } as any)) as any) ||
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
        const kind = e.data.kind as Cta["kind"] | undefined;
        const url = e.data.url as string | undefined;
        if (kind === "open_chat") {
          void ensureAndStart("chat");
          return;
        }
        if (kind === "open_booking") {
          void ensureAndStart("book");
          return;
        }
        if (kind === "open_url" && url) {
          window.open(url, "_blank", "noopener,noreferrer");
          return;
        }

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

  const makePromoPayload = (promoDoc: Doc<"promos">): PromoEmbedItem => {

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

    const card = (promoDoc as any)?.card as
      | {
          nudgeSize?: NudgeSize;
          mediaHeight?: MediaHeight;
          mediaPlacement?: MediaPlacement;
          contentBlocks?: NudgeContentBlockPayload[];
        }
      | undefined;

    return {
      title: promoDoc.card?.title,
      body: promoDoc.card?.body,
      imageUrl: (promoDoc as any)?.card?.imageUrl,
      videoUrl: (promoDoc as any)?.card?.videoUrl,
      primary: promoDoc.primaryCta?.label,
      secondary: promoDoc.secondaryCta?.label,
      primaryCta: promoDoc.primaryCta,
      secondaryCta: promoDoc.secondaryCta,
      avatars,
      privacyUrl,
      theme,
      brandLogoUrl,
      identityMode: promoDoc.identityMode ?? "auto",
      ctaList: simpleCtaList,
      canUseVoice,
      nudgeSize: card?.nudgeSize,
      mediaHeight: card?.mediaHeight,
      mediaPlacement: card?.mediaPlacement,
      contentBlocks: card?.contentBlocks,
    };
  };

  const expandPromoToItems = (promoDoc: Doc<"promos">) => {
    const base = makePromoPayload(promoDoc);
    const settings = (promoDoc as any).settings ?? {};
    if (settings.sequenceEnabled === false) {
      return [base];
    }
    const rawSteps = settings.sequenceSteps;
    if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
      return [base];
    }
    const cap = Math.max(
      1,
      Math.min(10, Math.floor(settings.maxSequenceItems ?? rawSteps.length)),
    );
    const steps = rawSteps.slice(0, cap);
    return steps.map((step: any) =>
      mergeStepCtas(
        {
          ...base,
          title:
            typeof step?.title === "string" && step.title.trim().length > 0
              ? step.title.trim()
              : "",
          body:
            typeof step?.body === "string" && step.body.trim().length > 0
              ? step.body.trim()
              : "",
          imageUrl:
            typeof step?.imageUrl === "string" && step.imageUrl.trim().length > 0
              ? step.imageUrl.trim()
              : base.imageUrl,
          videoUrl:
            typeof step?.videoUrl === "string" && step.videoUrl.trim().length > 0
              ? step.videoUrl.trim()
              : base.videoUrl,
          nudgeSize: (step?.nudgeSize as NudgeSize | undefined) ?? base.nudgeSize,
          mediaHeight: (step?.mediaHeight as MediaHeight | undefined) ?? base.mediaHeight,
          mediaPlacement:
            (step?.mediaPlacement as MediaPlacement | undefined) ?? base.mediaPlacement,
          contentBlocks:
            Array.isArray(step?.contentBlocks) && step.contentBlocks.length > 0
              ? (step.contentBlocks as NudgeContentBlockPayload[])
              : base.contentBlocks,
        },
        promoDoc,
        step,
      ),
    );
  };

  function shufflePromoItems<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j]!;
      a[j] = t!;
    }
    return a;
  }

  const makeSuggestionsPayload = (): SuggestionsPayload | null => {
    if (!ws) return null;

    const theme: ThemePayload | undefined = (ws as any)?.theme;
    const brandLogoUrl: string | undefined = (ws as any)?.brandLogoUrl;

    const privacyUrl =
      (ws as any)?.consent?.privacyUrl || (ws as any)?.privacyUrl || undefined;

    const greetMessage: string | undefined = (ws as any)?.greetMessage;

    const toTrimmedStringOrUndef = (v: unknown): string | undefined => {
      if (v == null) return undefined;
      const s = String(v).trim();
      return s.length ? s : undefined;
    };

    // Base suggestions from widget settings (guard against non-string legacy rows)
    const base1 = toTrimmedStringOrUndef((ws as any)?.defaultSuggestions?.suggestion1);
    const base2 = toTrimmedStringOrUndef((ws as any)?.defaultSuggestions?.suggestion2);
    const base3 = toTrimmedStringOrUndef((ws as any)?.defaultSuggestions?.suggestion3);

    // Optional override from per-page nudge configuration
    const s1 = toTrimmedStringOrUndef((pageNudge as any)?.suggestions?.suggestion1) ?? base1;
    const s2 = toTrimmedStringOrUndef((pageNudge as any)?.suggestions?.suggestion2) ?? base2;
    const s3 = toTrimmedStringOrUndef((pageNudge as any)?.suggestions?.suggestion3) ?? base3;

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

    const itemsRaw = matchedPromos.flatMap((p) => expandPromoToItems(p));
    const firstSettings = (matchedPromos[0] as any)?.settings ?? {};
    const sequenceRandomOrder = firstSettings.sequenceRandomOrder === true;
    const items =
      sequenceRandomOrder && itemsRaw.length > 1
        ? shufflePromoItems(itemsRaw)
        : itemsRaw;

    const sequenceSettings = {
      sequenceEnabled: firstSettings.sequenceEnabled ?? true,
      sequenceLoop: firstSettings.sequenceLoop === true,
      sequenceRandomOrder,
      showDelayAfterNavMs: firstSettings.showDelayAfterNavMs ?? 2500,
      autoCloseMs: firstSettings.autoCloseMs ?? 4500,
      betweenPopupsMs: firstSettings.betweenPopupsMs ?? 10000,
      maxSequenceItems: firstSettings.maxSequenceItems ?? 3,
      animationPreset: firstSettings.animationPreset ?? "soft_slide",
    };

    const key = [
      itemsRaw
        .map(
          (x) =>
            `${x.title || ""}:${x.body || ""}:${(x as any).imageUrl || ""}:${(x as any).videoUrl || ""}:${(x as PromoEmbedItem).nudgeSize || ""}:${(x as PromoEmbedItem).mediaHeight || ""}:${(x as PromoEmbedItem).mediaPlacement || ""}:${JSON.stringify((x as PromoEmbedItem).contentBlocks || [])}:${JSON.stringify((x as any).ctaList || [])}`,
        )
        .join("|"),
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
