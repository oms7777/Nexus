// apps/widget/modules/ui/components/SmartPromo.tsx
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useAtomValue, useSetAtom } from "jotai";
import { organizationIdAtom, contactSessionIdAtomFamily, conversationIdAtom, screenAtom } from "../../atoms/widget-atoms";
import { bookingIntentAtom } from "../../atoms/qualify-atoms";
import type { Doc } from "@workspace/backend/_generated/dataModel";

export default function SmartPromo() {
  const orgId = useAtomValue(organizationIdAtom);
  const sessionId = useAtomValue(contactSessionIdAtomFamily(orgId || ""));
  const setScreen = useSetAtom(screenAtom);
  const setConvId = useSetAtom(conversationIdAtom);
  const setBookingIntent = useSetAtom(bookingIntentAtom);

  const parentHrefRef = useRef<string | undefined>(undefined); // ✅ initial value
  const hiddenRef = useRef<boolean>(false);     

  // Settings (privacy/logo – facultatif)
  const ws = useQuery(api.public.widgetSettings.getByOrganizationId, orgId ? { organizationId: orgId } : "skip");

  // Avatars membres (public)
  const memberAvatars = useQuery(
    api.public.users.avatarsByOrg,
    orgId ? { organizationId: orgId, limit: 3 } : "skip"
  ) ?? [];

  // Promo applicable
  const currentUrl = typeof window !== "undefined" ? (parentHrefRef.current ?? window.location.href) : undefined;
  const utm = typeof window !== "undefined" && currentUrl ? new URL(currentUrl).searchParams.get("utm_source") || undefined : undefined;

  const promos = useQuery(
    api.public.promos.listForPage,
    orgId && currentUrl ? { organizationId: orgId, currentUrl, utmSource: utm } : "skip"
  ) ?? [];

  const promo: Doc<"promos"> | undefined = useMemo(() => (Array.isArray(promos) && promos.length ? promos[0] : undefined), [promos]);
  const promoRef = useRef(promo);
  promoRef.current = promo;

  const createConversation = useMutation(api.public.conversations.create);

  // Host -> widget: parent URL & hide signal & CTA triggers
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "nexus:parent-location" && typeof e.data.href === "string") {
        parentHrefRef.current = e.data.href;
      }
      if (e.data?.type === "nexus:hide-internal-promo") {
        hiddenRef.current = true;
      }
      if (!promoRef.current) return;
      if (e.data?.type === "nexus:run-primary-cta" && promoRef.current.primaryCta) runCta(promoRef.current.primaryCta);
      if (e.data?.type === "nexus:run-secondary-cta" && promoRef.current.secondaryCta) runCta(promoRef.current.secondaryCta);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Widget -> host: pousser les données du nudge
  useEffect(() => {
    if (!promo) return;

    // Fallback chain avatars
    const avatars =
      (memberAvatars && memberAvatars.length ? memberAvatars :
       (ws as any)?.teamAvatars?.length ? (ws as any).teamAvatars.slice(0,3) :
       (ws as any)?.brandLogoUrl ? [(ws as any).brandLogoUrl] :
       ["/logo.svg"]);

    const payload = {
      title: promo.card?.title || "Need a hand?",
      body: promo.card?.body || "Chat with our assistant or book a 15-min demo.",
      primary: promo.primaryCta?.label || "Chat",
      secondary: promo.secondaryCta?.label || "Book a demo",
      primaryCta: promo.primaryCta,
      secondaryCta: promo.secondaryCta,
      avatars,
      badgeText: promo.card?.badgeText || undefined,
      privacyUrl: (ws as any)?.consent?.privacyUrl || (ws as any)?.privacyUrl || undefined,
    };

    window.parent?.postMessage({ type: "nexus:promo", payload }, "*");
  }, [promo, memberAvatars, ws]);

  const goChat = async () => {
    setScreen("chat");
    try {
      if (orgId && sessionId) {
        const id = await createConversation({ organizationId: orgId, contactSessionId: sessionId });
        setConvId(id);
      }
    } catch {/* noop */}
  };

  const runCta = async (cta: Doc<"promos">["primaryCta"]) => {
    if (cta.kind === "open_chat") { setBookingIntent("none"); return goChat(); }
    if (cta.kind === "open_booking") { setBookingIntent("book"); return goChat(); }
    if (cta.kind === "open_url" && cta.url) window.open(cta.url, "_blank", "noopener,noreferrer");
  };

  // Ne masque pas le nudge interne sauf si l’hôte demande explicitement
  if (hiddenRef.current || !promo) return null;
  return null; // on laisse l’embed afficher la carte externe
}
