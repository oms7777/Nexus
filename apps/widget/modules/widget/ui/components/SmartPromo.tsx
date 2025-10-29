"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useAtomValue, useSetAtom } from "jotai";
import {
  organizationIdAtom,
  contactSessionIdAtomFamily,
  conversationIdAtom,
  screenAtom,
} from "../../atoms/widget-atoms";
import { bookingIntentAtom } from "../../atoms/qualify-atoms";
import { promoAtom } from "../../atoms/promo-atoms";
import type { Doc } from "@workspace/backend/_generated/dataModel";

type Cta = Doc<"promos">["primaryCta"];

export default function SmartPromo() {
  const orgId = useAtomValue(organizationIdAtom);
  const sessionId = useAtomValue(contactSessionIdAtomFamily(orgId || ""));
  const setScreen = useSetAtom(screenAtom);
  const setConvId = useSetAtom(conversationIdAtom);
  const setBookingIntent = useSetAtom(bookingIntentAtom);
  const setPromo = useSetAtom(promoAtom);

  const [parentHref, setParentHref] = useState<string>();
  const [hostAck, setHostAck] = useState(false);
  const isEmbedded =
    typeof window !== "undefined" ? window.parent !== window : false;

  // host ACK management
  useEffect(() => {
    if (!isEmbedded) return;
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type as string | undefined;
      if (t === "nexus:embed-ready") setHostAck(true);
      if (t === "nexus:parent-location" && typeof e.data.href === "string") {
        setParentHref(e.data.href);
      }
      if (t === "nexus:open-chat") {
        setBookingIntent("chat");
        setScreen("chat");
      }
      if (t === "nexus:run-primary-cta") handleRunCta("primary");
      if (t === "nexus:run-secondary-cta") handleRunCta("secondary");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [setBookingIntent, setScreen]);

  // Queries
  const ws = useQuery(
    api.public.widgetSettings.getByOrganizationId,
    orgId ? { organizationId: orgId } : "skip"
  );
  const memberAvatars =
    useQuery(api.public.users.listOrgAvatars, orgId ? { organizationId: orgId, limit: 3 } : "skip") ?? [];

  const currentUrl =
    typeof window !== "undefined" ? parentHref ?? window.location.href : undefined;
  const utm =
    typeof window !== "undefined" && currentUrl
      ? new URL(currentUrl).searchParams.get("utm_source") || undefined
      : undefined;

  const promos =
    useQuery(
      api.public.promos.listForPage,
      orgId && currentUrl ? { organizationId: orgId, currentUrl, utmSource: utm } : "skip"
    ) ?? [];

  const promo: Doc<"promos"> | undefined = useMemo(
    () => (Array.isArray(promos) && promos.length ? promos[0] : undefined),
    [promos]
  );

  // Stockage du dernier promo
  const promoRef = useRef<Doc<"promos"> | undefined>(undefined);
  useEffect(() => {
    if (promo) {
      promoRef.current = promo;
      setPromo(promo);
    }
  }, [promo, setPromo]);

  const createConversation = useMutation(api.public.conversations.create);

  const fallbackPayload = useMemo(
    () => ({
      title: "Get help fast or schedule time",
      body: "Chat now or book a 15-min demo.",
      primary: "Chat with AI",
      secondary: "Book a meeting",
      primaryCta: { kind: "open_chat", label: "Chat with AI" as const },
      secondaryCta: { kind: "open_booking", label: "Book a meeting" as const },
    }),
    []
  );

  const makePayload = () => {
    const avatars =
      memberAvatars.length
        ? memberAvatars
        : (ws as any)?.teamAvatars?.length
        ? (ws as any).teamAvatars.slice(0, 3)
        : (ws as any)?.brandLogoUrl
        ? [(ws as any).brandLogoUrl]
        : ["/logo.svg"];

    const p = promo ?? undefined;
    return {
      title: p?.card?.title ?? fallbackPayload.title,
      body: p?.card?.body ?? fallbackPayload.body,
      primary: p?.primaryCta?.label ?? fallbackPayload.primary,
      secondary: p?.secondaryCta?.label ?? fallbackPayload.secondary,
      primaryCta: p?.primaryCta ?? fallbackPayload.primaryCta,
      secondaryCta: p?.secondaryCta ?? fallbackPayload.secondaryCta,
      avatars,
      badgeText: p?.card?.badgeText || undefined,
      privacyUrl: (ws as any)?.consent?.privacyUrl || (ws as any)?.privacyUrl || undefined,
    };
  };

  // Send promo to host when ready
  useEffect(() => {
    if (!isEmbedded || !hostAck) return;
    const payload = makePayload();
    window.parent?.postMessage({ type: "nexus:promo", payload }, "*");
  }, [isEmbedded, hostAck, promo, ws, memberAvatars]);

  // Conversation bootstrap
  const goChat = async () => {
    setScreen("chat");
    try {
      if (orgId && sessionId) {
        const id = await createConversation({
          organizationId: orgId,
          contactSessionId: sessionId,
        });
        setConvId(id);
      }
    } catch (e) {
      console.warn("Conversation create error:", e);
    }
  };

  const handleRunCta = async (ctaType: "primary" | "secondary") => {
    const p = promoRef.current;
    const cta = ctaType === "primary" ? p?.primaryCta : p?.secondaryCta;
    if (!cta) return;

    switch (cta.kind) {
      case "open_chat":
        setBookingIntent("chat");
        return goChat();
      case "open_booking":
        setBookingIntent("book");
        return goChat();
      case "open_url":
        if (cta.url) window.open(cta.url, "_blank", "noopener,noreferrer");
        break;
    }
  };

  const showInternal = !!promo && !isEmbedded;
  if (!showInternal) return null;

  return null;
}
