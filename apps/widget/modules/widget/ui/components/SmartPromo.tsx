// apps/widget/modules/ui/components/SmartPromo.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { Doc } from "@workspace/backend/_generated/dataModel";

export default function SmartPromo() {
  const orgId = useAtomValue(organizationIdAtom);
  const sessionId = useAtomValue(contactSessionIdAtomFamily(orgId || ""));
  const setScreen = useSetAtom(screenAtom);
  const setConvId = useSetAtom(conversationIdAtom);
  const setBookingIntent = useSetAtom(bookingIntentAtom);

  const [hidden, setHidden] = useState(false);
  const [parentHref, setParentHref] = useState<string | undefined>(undefined);

  // ✅ settings publics pour avatars/logo/privacy
  const widgetSettings = useQuery(
    api.public.widgetSettings.getByOrganizationId,
    orgId ? { organizationId: orgId } : "skip"
  );

  // URL du parent + signal pour cacher la carte interne (si le parent affiche le nudge)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type;
      if (t === "nexus:parent-location" && typeof e.data.href === "string") {
        setParentHref(e.data.href);
      }
      if (t === "nexus:hide-internal-promo") {
        setHidden(true);
      }
      // Actions CTA en provenance du parent
      if (!promoRef.current) return;
      if (t === "nexus:run-primary-cta" && promoRef.current.primaryCta) {
        void runCta(promoRef.current.primaryCta);
      }
      if (t === "nexus:run-secondary-cta" && promoRef.current.secondaryCta) {
        void runCta(promoRef.current.secondaryCta);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const currentUrl =
    typeof window !== "undefined" ? (parentHref ?? window.location.href) : undefined;

  const utm =
    typeof window !== "undefined" && currentUrl
      ? new URL(currentUrl).searchParams.get("utm_source") || undefined
      : undefined;

  // Promo applicable à la page hôte
  const promos =
    useQuery(
      api.public.promos.listForPage,
      orgId && currentUrl
        ? { organizationId: orgId, currentUrl, utmSource: utm }
        : "skip"
    ) ?? [];

  const promo = useMemo<Doc<"promos"> | undefined>(
    () => (Array.isArray(promos) && promos.length ? promos[0] : undefined),
    [promos]
  );

  // Ref pour l'utiliser dans l’écouteur de message
  const promoRef = useMemo(() => ({ current: promo ?? ({} as any) }), [promo]);
  if (promo) promoRef.current = promo;

  const createConversation = useMutation(api.public.conversations.create);

  // Pousser la promo au parent (nudge externe)
  useEffect(() => {
    if (!promo) return;

    const ws: any = widgetSettings || {};
    const avatars: string[] =
      (ws.teamAvatars && Array.isArray(ws.teamAvatars) && ws.teamAvatars.filter(Boolean).slice(0, 3)) ||
      (ws.brandLogoUrl ? [ws.brandLogoUrl] : ["/logo.svg"]);

    const payload = {
      title: promo.card?.title || "Need a hand?",
      body: promo.card?.body || "Chat with our assistant or book a 15-min demo.",
      primary: promo.primaryCta?.label || "Chat",
      secondary: promo.secondaryCta?.label || "Book a demo",
      primaryCta: promo.primaryCta,
      secondaryCta: promo.secondaryCta,
      avatars,
      badgeText: promo.card?.badgeText || "Live",
      privacyUrl: ws.privacyUrl || undefined,
      brandName: ws.brandName || "Chat",
    };

    // Important: poster à chaque changement de promo / URL parent / settings
    window.parent?.postMessage({ type: "nexus:promo", payload }, "*");
  }, [promo, parentHref, widgetSettings]);

  // Ouvre l'écran chat et crée/reprend la conversation
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
    } catch { /* no-op */ }
  };

  // Routage des CTA
  const runCta = async (cta: Doc<"promos">["primaryCta"]) => {
    if (cta.kind === "open_chat") {
      setBookingIntent("none");
      return goChat();
    }
    if (cta.kind === "open_booking") {
      setBookingIntent("book");
      return goChat();
    }
    if (cta.kind === "open_url" && cta.url) {
      window.open(cta.url, "_blank", "noopener,noreferrer");
    }
  };

  // On n'affiche rien côté iframe quand le parent gère le nudge
  if (hidden || !promo) return null;
  return null;
}
