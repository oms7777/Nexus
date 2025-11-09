"use client";

/**
 * SmartPromo
 * -----------
 * - Envoie le payload "nexus:promo" au host (nudge)
 * - Réagit aux messages du host :
 *    - "nexus:open-chat" => intent=chat → step=consent → screen=chat
 *    - "nexus:run-primary-cta" / "nexus:run-secondary-cta" => exécute CTA
 *
 * IMPORTANT :
 * - Ne crée PLUS de conversation ici.
 * - La création de conversation est gérée après consent dans WidgetChatScreen.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useAtomValue, useSetAtom } from "jotai";
import { organizationIdAtom, screenAtom } from "../../atoms/widget-atoms";
import { bookingIntentAtom, qualifyStepAtom } from "../../atoms/qualify-atoms";
import type { Doc } from "@workspace/backend/_generated/dataModel";

type Cta = Doc<"promos">["primaryCta"];

export default function SmartPromo() {
  const orgId = useAtomValue(organizationIdAtom);

  const setScreen = useSetAtom(screenAtom);
  const setBookingIntent = useSetAtom(bookingIntentAtom);
  const setStep = useSetAtom(qualifyStepAtom);

  const [parentHref, setParentHref] = useState<string>();
  const [hostAck, setHostAck] = useState(false);

  // Widget embarqué ?
  const isEmbedded =
    typeof window !== "undefined" ? window.parent !== window : false;

  // Settings + avatars + promos
  const ws = useQuery(
    api.public.widgetSettings.getByOrganizationId,
    orgId ? { organizationId: orgId } : "skip",
  );

  const memberAvatars =
    useQuery(
      api.public.users.listOrgAvatars,
      orgId ? { organizationId: orgId, limit: 3 } : "skip",
    ) ?? [];

  const currentUrl =
    typeof window !== "undefined"
      ? parentHref ?? window.location.href
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
        : "skip",
    ) ?? [];

  const promo: Doc<"promos"> | undefined = useMemo(
    () => (Array.isArray(promos) && promos.length ? promos[0] : undefined),
    [promos],
  );

  // Référence stable de la promo pour le listener
  const promoRef = useRef<Doc<"promos"> | undefined>(undefined);
  useEffect(() => {
    promoRef.current = promo;
  }, [promo]);

  /* ---------------- Host -> Widget ---------------- */

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type as string | undefined;

      // Host prêt + position de la page
      if (
        t === "nexus:embed-ready" ||
        t === "nexus:parent-location" ||
        t === "nexus:hide-internal-promo"
      ) {
        setHostAck(true);
      }

      if (t === "nexus:parent-location" && typeof e.data.href === "string") {
        setParentHref(e.data.href);
      }

      // Clic sur le bouton rond → ouvrir chat avec consent d’abord
      if (t === "nexus:open-chat") {
        setBookingIntent("chat");
        setStep("consent");
        setScreen("chat");
        return;
      }

      // CTAs du nudge
      const p = promoRef.current;
      if (!p) return;

      if (t === "nexus:run-primary-cta" && p.primaryCta) void runCta(p.primaryCta);
      if (t === "nexus:run-secondary-cta" && p.secondaryCta)
        void runCta(p.secondaryCta);
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [setBookingIntent, setScreen, setStep]);

  /* ---------------- Payload du nudge ---------------- */

  const fallbackPayload = useMemo(
    () => ({
      title: "Get help fast or schedule time",
      body: "Chat now or book a 15-min demo.",
      primary: "Chat with AI",
      secondary: "Book a meeting",
      primaryCta: { kind: "open_chat", label: "Chat with AI" as const },
      secondaryCta: { kind: "open_booking", label: "Book a meeting" as const },
    }),
    [],
  );

  const makePayload = () => {
    const avatars = memberAvatars.length
      ? memberAvatars
      : (ws as any)?.teamAvatars?.length
      ? (ws as any).teamAvatars.slice(0, 3)
      : (ws as any)?.brandLogoUrl
      ? [(ws as any).brandLogoUrl]
      : ["/logo.svg"];

    const privacyUrl =
      (ws as any)?.consent?.privacyUrl || (ws as any)?.privacyUrl || undefined;

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
        privacyUrl,
      };
    }
    return { ...fallbackPayload, avatars, privacyUrl };
  };

  // Envoi du nudge une fois que le host est prêt
  useEffect(() => {
    if (!isEmbedded) return;
    if (!hostAck) return;

    window.parent?.postMessage(
      { type: "nexus:promo", payload: makePayload() },
      "*",
    );
  }, [isEmbedded, hostAck, promo, memberAvatars, ws]);

  /* ---------------- CTAs ---------------- */

  const runCta = async (cta: Cta) => {
    if (cta.kind === "open_chat") {
      setBookingIntent("chat");
      setStep("consent");
      setScreen("chat");
      return;
    }
    if (cta.kind === "open_booking") {
      setBookingIntent("book");
      setStep("consent");
      setScreen("chat");
      return;
    }
    if (cta.kind === "open_url" && cta.url) {
      window.open(cta.url, "_blank", "noopener,noreferrer");
    }
  };

  /* ---------------- Debug interne (pas embarqué) ---------------- */

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
        <div className="mt-3 flex gap-2">
          <button
            className="h-9 flex-1 rounded-md bg-sky-500 px-3 font-medium text-white"
            onClick={() => promo?.primaryCta && runCta(promo.primaryCta)}
          >
            {promo?.primaryCta?.label ?? "Chat"}
          </button>
          {promo?.secondaryCta && (
            <button
              className="h-9 flex-1 rounded-md border px-3 font-medium"
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
