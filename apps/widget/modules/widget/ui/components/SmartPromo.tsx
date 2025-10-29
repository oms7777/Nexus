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
import type { Doc } from "@workspace/backend/_generated/dataModel";
import { bookingIntentAtom } from "../../atoms/qualify-atoms";

type Cta = Doc<"promos">["primaryCta"];

export default function SmartPromo() {
  const orgId = useAtomValue(organizationIdAtom);
  const sessionId = useAtomValue(contactSessionIdAtomFamily(orgId || ""));
  const setScreen = useSetAtom(screenAtom);
  const setConvId = useSetAtom(conversationIdAtom);
  const setBookingIntent = useSetAtom(bookingIntentAtom);

  const [parentHref, setParentHref] = useState<string>();
  const isEmbedded = typeof window !== "undefined" ? window.parent !== window : false;

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

  const promoRef = useRef<Doc<"promos"> | undefined>(undefined);
  useEffect(() => { promoRef.current = promo; }, [promo]);

  const createConversation = useMutation(api.public.conversations.create);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type as string | undefined;
      if (t === "nexus:parent-location" && typeof e.data.href === "string") setParentHref(e.data.href);
      if (t === "nexus:open-chat") {
        setBookingIntent("chat");
        setScreen("chat");
        return;
      }
      const p = promoRef.current;
      if (!p) return;
      if (t === "nexus:run-primary-cta" && p.primaryCta) void runCta(p.primaryCta);
      if (t === "nexus:run-secondary-cta" && p.secondaryCta) void runCta(p.secondaryCta);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [setBookingIntent, setScreen]);

  const fallbackPayload = useMemo(
    () => ({
      title: "Get help fast or schedule time",
      body: "Chat now or book a 15-min demo.",
      primary: "Chat with AI Assistant",
      secondary: "Book a meeting",
      primaryCta: { kind: "open_chat", label: "Chat with AI Assistant" as const },
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

    if (promo) {
      return {
        title: promo.card?.title,
        body: promo.card?.body,
        primary: promo.primaryCta?.label,
        secondary: promo.secondaryCta?.label,
        primaryCta: promo.primaryCta,
        secondaryCta: promo.secondaryCta,
        avatars,
        badgeText: promo.card?.badgeText || undefined,
        privacyUrl: (ws as any)?.consent?.privacyUrl || (ws as any)?.privacyUrl || undefined,
      };
    }
    return { ...fallbackPayload, avatars, privacyUrl: (ws as any)?.consent?.privacyUrl || (ws as any)?.privacyUrl || undefined };
  };

  useEffect(() => {
    if (!isEmbedded) return;
    const payload = makePayload();
    window.parent?.postMessage({ type: "nexus:promo", payload }, "*");
    window.dispatchEvent(new CustomEvent("nexus:promo-card", { detail: payload }));
  }, [isEmbedded, promo, memberAvatars, ws]);

  const goChat = async () => {
    setScreen("chat");
    try {
      if (orgId && sessionId) {
        const id = await createConversation({ organizationId: orgId, contactSessionId: sessionId });
        setConvId(id);
      }
    } catch {}
  };

  const runCta = async (cta: Cta) => {
    if (cta.kind === "open_chat") { setBookingIntent("chat"); return goChat(); }
    if (cta.kind === "open_booking") { setBookingIntent("book"); return goChat(); }
    if (cta.kind === "open_url" && cta.url) window.open(cta.url, "_blank", "noopener,noreferrer");
  };

  return null;
}
