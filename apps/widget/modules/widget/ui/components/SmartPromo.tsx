"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useAtomValue, useSetAtom } from "jotai";
import {
  organizationIdAtom,
  screenAtom,
  conversationIdAtom,
  contactSessionIdAtomFamily,
} from "../../atoms/widget-atoms";
import { bookingIntentAtom, qualifyStepAtom } from "../../atoms/qualify-atoms";
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

export default function SmartPromo() {
  const orgId = useAtomValue(organizationIdAtom);

  const setScreen = useSetAtom(screenAtom);
  const setBookingIntent = useSetAtom(bookingIntentAtom);
  const setStep = useSetAtom(qualifyStepAtom);
  const setConversationId = useSetAtom(conversationIdAtom);

  const currentConvId = useAtomValue(conversationIdAtom);

  const contactSessionId = useAtomValue(contactSessionIdAtomFamily(orgId || ""));
  const setContactSessionId = useSetAtom(contactSessionIdAtomFamily(orgId || ""));

  const ensureContactSession = useMutation(api.public.contactSessions.ensure);
  const createConversation = useMutation(api.public.conversations.create);

  const [parentHref, setParentHref] = useState<string>();
  const sentRef = useRef(false);

  const isEmbedded =
    typeof window !== "undefined" ? window.parent !== window : false;

  // ----- Data (Convex)
  const ws = useQuery(
    api.public.widgetSettings.getByOrganizationId,
    orgId ? { organizationId: orgId } : "skip"
  );

  const memberAvatars =
    useQuery(
      api.public.users.listOrgAvatars,
      orgId ? { organizationId: orgId, limit: 3 } : "skip"
    ) ?? [];

  // 🔎 Optionnel mais utile : on vérifie si la conv courante existe et si elle est resolved
  const existingConversation = useQuery(
    api.public.conversations.getOne,
    orgId && contactSessionId && currentConvId
      ? { conversationId: currentConvId, contactSessionId }
      : "skip"
  );

  // 🔑 IMPORTANT : utiliser parentHref OU document.referrer avant window.location
  const currentUrl =
    typeof window !== "undefined"
      ? parentHref || document.referrer || window.location.href
      : undefined;

  const utm =
    typeof window !== "undefined" && currentUrl
      ? new URL(currentUrl).searchParams.get("utm_source") || undefined
      : undefined;

  const promos =
    useQuery(
      api.public.promos.listForPage,
      orgId && currentUrl
        ? { organizationId: orgId, currentUrl, utmSource: utm }
        : "skip"
    ) ?? [];

  const promo: Doc<"promos"> | undefined = useMemo(
    () => (Array.isArray(promos) && promos.length ? promos[0] : undefined),
    [promos]
  );

  const promoRef = useRef<Doc<"promos"> | undefined>(undefined);
  useEffect(() => {
    promoRef.current = promo;
  }, [promo]);

  /**
   * ✅ IMPORTANT :
   * - Si une conversationId existe déjà ET elle est pas resolved => on la réutilise.
   * - Sinon => on en crée une nouvelle.
   */
  const ensureAndStartChat = async (intent: "chat" | "book") => {
    if (!orgId) {
      setScreen("error");
      return;
    }

    setBookingIntent(intent);
    setStep("consent");

    // 1) session
    const sessionId: Id<"contactSessions"> =
      contactSessionId || (await ensureContactSession({ organizationId: orgId }));
    if (!contactSessionId) setContactSessionId(sessionId);

    // 2) si conv existante OK => reuse
    const convIsReusable =
      !!currentConvId &&
      existingConversation !== undefined &&
      !!existingConversation &&
      existingConversation.status !== "resolved";

    if (convIsReusable) {
      setScreen("chat");
      return;
    }

    // 3) sinon create new
    const convId = await createConversation({
      contactSessionId: sessionId,
      organizationId: orgId,
      suppressGreet: intent === "book" ? true : undefined,
    } as any);

    setConversationId(convId);
    setScreen("chat");
  };

  const runCta = async (cta: Cta) => {
    if (cta.kind === "open_chat") return ensureAndStartChat("chat");
    if (cta.kind === "open_booking") return ensureAndStartChat("book");
    if (cta.kind === "open_url" && cta.url) {
      window.open(cta.url, "_blank", "noopener,noreferrer");
    }
  };

  // Host → Widget bridge
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type as string | undefined;

      if (t === "nexus:parent-location" && typeof e.data.href === "string") {
        setParentHref(e.data.href);
        return;
      }

      if (t === "nexus:open-chat") {
        void ensureAndStartChat("chat");
        return;
      }

      if (t === "nexus:run-primary-cta") {
        const p = promoRef.current;
        void (p?.primaryCta ? runCta(p.primaryCta) : ensureAndStartChat("chat"));
        return;
      }

      if (t === "nexus:run-secondary-cta") {
        const p = promoRef.current;
        void (p?.secondaryCta ? runCta(p.secondaryCta) : ensureAndStartChat("book"));
        return;
      }

      if (t === "nexus:run-cta" && typeof e.data.index === "number") {
        const idx = e.data.index as number;
        const p = promoRef.current;

        if (!p) {
          void ensureAndStartChat("chat");
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

        void ensureAndStartChat("chat");
      }
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, contactSessionId, currentConvId, existingConversation]);

  // ----- Payload for host (avec thème + logo + multi-CTA)
  const makePayload = () => {
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
    };
  };

  // ---- Envoi fiable au host : uniquement si promo prête
  useEffect(() => {
    if (!isEmbedded) return;

    const payload = makePayload();
    if (!payload) return;

    const send = () =>
      window.parent?.postMessage({ type: "nexus:promo", payload }, "*");

    if (sentRef.current) {
      send();
      return;
    }
    sentRef.current = true;

    send();
    const t1 = setTimeout(send, 120);
    const t2 = setTimeout(send, 600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isEmbedded, promo, memberAvatars, ws, parentHref]);

  const showInternal = !!promo && !isEmbedded;
  if (!showInternal) return null;

  return (
    <div
      className="fixed bottom-4 right-4 w-[320px] rounded-xl border bg-white shadow-lg"
      style={{ zIndex: 1000 }}
    >
      <div className="p-3">
        {promo?.card?.badgeText && (
          <div className="mb-2 inline-block rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
            {promo.card.badgeText}
          </div>
        )}
        <div className="font-semibold">
          {promo?.card?.title ?? "Need a hand?"}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {promo?.card?.body ?? "Chat with our assistant or book a 15-min demo."}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {promo.primaryCta && (
            <button
              className="h-9 w-full rounded-md bg-sky-500 px-3 font-medium text-white"
              onClick={() => runCta(promo.primaryCta!)}
            >
              {promo.primaryCta.label ?? "Chat"}
            </button>
          )}
          {promo.secondaryCta && (
            <button
              className="h-9 w-full rounded-md border px-3 font-medium"
              onClick={() => runCta(promo.secondaryCta!)}
            >
              {promo.secondaryCta.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
