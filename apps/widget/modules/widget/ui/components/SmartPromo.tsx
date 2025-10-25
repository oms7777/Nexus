// apps/widget/modules/ui/components/SmartPromo.tsx
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
import type { Doc } from "@workspace/backend/_generated/dataModel";

export default function SmartPromo() {
  const orgId = useAtomValue(organizationIdAtom);
  const sessionId = useAtomValue(contactSessionIdAtomFamily(orgId || ""));
  const setScreen = useSetAtom(screenAtom);
  const setConvId = useSetAtom(conversationIdAtom);
  const setBookingIntent = useSetAtom(bookingIntentAtom);

  // Host state (so we re-render on SPA URL changes)
  const [parentHref, setParentHref] = useState<string | undefined>(undefined);
  const [hidden, setHidden] = useState(false); // kept for future internal card, harmless now

  // Settings (privacy/logo fallback)
  const ws = useQuery(
    api.public.widgetSettings.getByOrganizationId,
    orgId ? { organizationId: orgId } : "skip"
  );

  // Org members’ avatars (randomized server-side list)
  const memberAvatars =
    useQuery(
      api.public.users.listOrgAvatars,
      orgId ? { organizationId: orgId, limit: 3 } : "skip"
    ) ?? [];

  // Current URL (prefer parent SPA URL if provided)
  const currentUrl =
    typeof window !== "undefined" ? parentHref ?? window.location.href : undefined;
  const utm =
    typeof window !== "undefined" && currentUrl
      ? new URL(currentUrl).searchParams.get("utm_source") || undefined
      : undefined;

  // Promos for this page
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

  // Keep a ref of the current promo for message handlers
  const promoRef = useRef<Doc<"promos"> | undefined>(undefined);
  useEffect(() => {
    promoRef.current = promo;
  }, [promo]);

  const createConversation = useMutation(api.public.conversations.create);

  // Host -> widget messages (parent URL changes, hide signal, CTA triggers)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type;
      if (t === "nexus:parent-location" && typeof e.data.href === "string") {
        setParentHref(e.data.href);
      }
      if (t === "nexus:hide-internal-promo") {
        setHidden(true);
      }
      const p = promoRef.current;
      if (!p) return;
      if (t === "nexus:run-primary-cta" && p.primaryCta) void runCta(p.primaryCta);
      if (t === "nexus:run-secondary-cta" && p.secondaryCta) void runCta(p.secondaryCta);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // no deps: we want a single stable listener using promoRef
  }, []);

  // Widget -> host: push the nudge payload
  useEffect(() => {
    if (!promo) return;

    // Fallback chain for avatars
    const avatars =
      memberAvatars && memberAvatars.length
        ? memberAvatars
        : (ws as any)?.teamAvatars?.length
        ? (ws as any).teamAvatars.slice(0, 3)
        : (ws as any)?.brandLogoUrl
        ? [(ws as any).brandLogoUrl]
        : ["/logo.svg"];

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
  }, [promo, memberAvatars, ws, parentHref]); // re-post on SPA nav or settings change

  // CTA handlers
  const goChat = async () => {
    setScreen("chat");
    try {
      if (orgId && sessionId) {
        const id = await createConversation({ organizationId: orgId, contactSessionId: sessionId });
        setConvId(id);
      }
    } catch {
      /* no-op */
    }
  };

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

  // We let the host show the nudge; nothing is rendered inside the iframe.
  return null;
}
