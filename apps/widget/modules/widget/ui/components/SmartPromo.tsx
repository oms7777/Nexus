"use client";

/**
 * SmartPromo (robuste)
 * - Handshake propre host <-> widget via postMessage
 * - Envoie "nexus:promo" dès que le host est prêt (avec retry)
 * - Gère les CTAs :
 *    - open_chat     → chat (consent d’abord)
 *    - open_booking  → booking (consent d’abord)
 *    - open_url      → nouvelle fenêtre
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useAtomValue, useSetAtom } from "jotai";
import { organizationIdAtom, screenAtom } from "../../atoms/widget-atoms";
import { bookingIntentAtom, qualifyStepAtom } from "../../atoms/qualify-atoms";
import type { Doc } from "@workspace/backend/_generated/dataModel";

type Cta = Doc<"promos">["primaryCta"];
type PromoDoc = Doc<"promos"> | undefined;

const LOG_PREFIX = "[SmartPromo]";

export default function SmartPromo() {
  const orgId = useAtomValue(organizationIdAtom);

  const setScreen = useSetAtom(screenAtom);
  const setBookingIntent = useSetAtom(bookingIntentAtom);
  const setStep = useSetAtom(qualifyStepAtom);

  const [parentHref, setParentHref] = useState<string>();
  const [hostReady, setHostReady] = useState(false);
  const [targetOrigin, setTargetOrigin] = useState<string | null>(null);

  // Sommes-nous embarqués ?
  const isEmbedded =
    typeof window !== "undefined" ? window.parent !== window : false;

  /* ---------------- Data ---------------- */

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

  const promo: PromoDoc = useMemo(
    () => (Array.isArray(promos) && promos.length ? promos[0] : undefined),
    [promos],
  );

  // Référence stable de promo pour le listener
  const promoRef = useRef<PromoDoc>(undefined);
  useEffect(() => {
    promoRef.current = promo;
  }, [promo]);

  /* ---------------- Handshake Host -> Widget ---------------- */

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      // DEBUG global
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} <-`, e.origin, e.data);

      const t = e.data?.type as string | undefined;

      // Le host nous indique son readiness + nous envoie sa location.
      if (t === "nexus:embed-ready" || t === "nexus:hide-internal-promo") {
        if (!targetOrigin) setTargetOrigin(e.origin);
        setHostReady(true);
      }

      if (t === "nexus:parent-location" && typeof e.data.href === "string") {
        if (!targetOrigin) setTargetOrigin(e.origin);
        setHostReady(true);
        setParentHref(e.data.href);
      }

      // Ouverture du chat depuis le bouton rond du host
      if (t === "nexus:open-chat") {
        setBookingIntent("chat");
        setStep("consent");
        setScreen("chat");
        return;
      }

      // CTAs du nudge (host)
      const p = promoRef.current;
      if (!p) return;

      if (t === "nexus:run-primary-cta" && p.primaryCta) runCta(p.primaryCta);
      if (t === "nexus:run-secondary-cta" && p.secondaryCta) runCta(p.secondaryCta);
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [setBookingIntent, setScreen, setStep, targetOrigin]);

  /* ---------------- Construction du payload ---------------- */

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

  const buildPayload = () => {
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

  /* ---------------- Envoi du payload au host ---------------- */

  // Post utilitaire avec origine connue
  const postToHost = (msg: any) => {
    if (!isEmbedded) return;
    if (!targetOrigin) return;
    try {
      window.parent.postMessage(msg, targetOrigin);
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} ->`, targetOrigin, msg);
    } catch (e) {
      console.warn(`${LOG_PREFIX} postMessage failed`, e);
    }
  };

  // Envoi dès que le host est prêt (avec petite stratégie de retry)
  useEffect(() => {
    if (!isEmbedded) return;
    if (!hostReady) return;

    let cancelled = false;
    const payload = buildPayload();

    const send = () => {
      if (cancelled) return;
      postToHost({ type: "nexus:promo", payload });
    };

    // premier envoi
    send();

    // 2 petits retries si le host n’a pas affiché le nudge tout de suite
    const t1 = setTimeout(send, 400);
    const t2 = setTimeout(send, 1200);

    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isEmbedded, hostReady, promo, memberAvatars, ws, targetOrigin]);

  /* ---------------- CTAs ---------------- */

  const runCta = (cta: Cta) => {
    if (cta.kind === "open_chat") {
      setBookingIntent("chat");
      setStep("consent");
      setScreen("chat");
      return;
    }
    if (cta.kind === "open_booking") {
      // 👉 Basculer vers le flow booking (comme en local)
      setBookingIntent("book");
      setStep("consent");
      setScreen("booking");
      return;
    }
    if (cta.kind === "open_url" && cta.url) {
      window.open(cta.url, "_blank", "noopener,noreferrer");
    }
  };

  /* ---------------- Debug interne (quand non embarqué) ---------------- */

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
