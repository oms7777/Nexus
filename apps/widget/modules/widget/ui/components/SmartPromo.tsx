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

  // Settings publics (brand logo, privacy, team avatars)
  const widgetSettings = useQuery(
    api.public.widgetSettings.getByOrganizationId,
    orgId ? { organizationId: orgId } : "skip"
  );

  // URL du parent + signal pour cacher la carte interne
  useEffect(() => {
    const onParentLoc = (e: MessageEvent) => {
      if (e.data?.type === "nexus:parent-location" && typeof e.data.href === "string") {
        setParentHref(e.data.href);
      }
      if (e.data?.type === "nexus:hide-internal-promo") setHidden(true);
    };
    window.addEventListener("message", onParentLoc);
    return () => window.removeEventListener("message", onParentLoc);
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

  const promo: Doc<"promos"> | undefined = useMemo(
    () => (Array.isArray(promos) && promos.length ? promos[0] : undefined),
    [promos]
  );

  const createConversation = useMutation(api.public.conversations.create);

  // Pousser la promo au parent (nudge externe)
  useEffect(() => {
    if (!promo) return;

    // On prend jusqu'à 3 avatars :
    // 1) widgetSettings.teamAvatars (si présent)
    // 2) widgetSettings.brandLogoUrl
    // 3) /logo.svg
    const raw = (widgetSettings as any)?.teamAvatars as string[] | undefined;
    const avatars =
      (raw && raw.filter(Boolean).slice(0, 3)) ||
      ((widgetSettings as any)?.brandLogoUrl ? [(widgetSettings as any).brandLogoUrl] : ["/logo.svg"]);

    const payload = {
      title: promo.card?.title || "Need a hand?",
      body: promo.card?.body || "Chat with our assistant or book a 15-min demo.",
      primary: promo.primaryCta?.label || "Chat",
      secondary: promo.secondaryCta?.label || "Book a demo",
      primaryCta: promo.primaryCta,
      secondaryCta: promo.secondaryCta,
      avatars,
      privacyUrl: (widgetSettings as any)?.privacyUrl || undefined,
      brandName: (widgetSettings as any)?.brandName || "Chat",
    };

    window.parent?.postMessage({ type: "nexus:promo", payload }, "*");
  }, [promo, parentHref, widgetSettings]);

  // Écoute des CTA du nudge parent
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (!promo) return;
      const t = e.data?.type;
      if (t === "nexus:run-primary-cta" && promo.primaryCta) void runCta(promo.primaryCta);
      if (t === "nexus:run-secondary-cta" && promo.secondaryCta) void runCta(promo.secondaryCta);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [promo]);

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
    } catch {
      /* no-op */
    }
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

  // Si le parent affiche le nudge (ou pas de promo), on ne rend rien dans l'iframe
  if (hidden || !promo) return null;
  return null;
}
