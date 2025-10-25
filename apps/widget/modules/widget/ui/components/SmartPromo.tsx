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

  const [parentHref, setParentHref] = useState<string | undefined>(undefined);
  const [hostAcknowledged, setHostAcknowledged] = useState(false); // flip true when host sends back any control msg
  const isEmbedded =
    typeof window !== "undefined" ? window.parent !== window : false;

  // Settings (privacy/logo fallback)
  const ws = useQuery(
    api.public.widgetSettings.getByOrganizationId,
    orgId ? { organizationId: orgId } : "skip"
  );

  // Org avatars (public)
  const memberAvatars =
    useQuery(
      api.public.users.listOrgAvatars,
      orgId ? { organizationId: orgId, limit: 3 } : "skip"
    ) ?? [];

  // Current URL (prefer parent)
  const currentUrl =
    typeof window !== "undefined" ? parentHref ?? window.location.href : undefined;
  const utm =
    typeof window !== "undefined" && currentUrl
      ? new URL(currentUrl).searchParams.get("utm_source") || undefined
      : undefined;

  // Promo(s) for this page
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

  // Keep promo in a ref for stable message handler
  const promoRef = useRef<Doc<"promos"> | undefined>(undefined);
  useEffect(() => {
    promoRef.current = promo;
  }, [promo]);

  const createConversation = useMutation(api.public.conversations.create);

  // Host -> widget messages
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type;
      if (t === "nexus:parent-location" && typeof e.data.href === "string") {
        setParentHref(e.data.href);
        setHostAcknowledged(true);
      }
      if (t === "nexus:hide-internal-promo") {
        setHostAcknowledged(true);
      }
      const p = promoRef.current;
      if (!p) return;
      if (t === "nexus:run-primary-cta" && p.primaryCta) void runCta(p.primaryCta);
      if (t === "nexus:run-secondary-cta" && p.secondaryCta) void runCta(p.secondaryCta);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Push nudge payload to host (external nudge)
  useEffect(() => {
    if (!promo) return;

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

    // Post to host (will only be picked up when embedded with the embed script)
    window.parent?.postMessage({ type: "nexus:promo", payload }, "*");
    // eslint-disable-next-line no-console
    console.debug("[SmartPromo] posted nexus:promo to host", payload);
  }, [promo, memberAvatars, ws, parentHref]);

  // CTA helpers
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

  // ---- INTERNAL DEBUG CARD (only when not embedded OR host never responded) ----
  // This lets you see a nudge during local dev at http://localhost:3001/…
  const shouldShowInternalDebug =
    !!promo && (!isEmbedded || !hostAcknowledged);

  if (!shouldShowInternalDebug) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[1000] w-[320px] rounded-xl border bg-white shadow-lg">
      <div className="p-3">
        {promo.card?.badgeText && (
          <div className="mb-2 inline-block rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
            {promo.card.badgeText}
          </div>
        )}
        <div className="font-semibold">{promo.card?.title ?? "Need a hand?"}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {promo.card?.body ?? "Chat with our assistant or book a 15-min demo."}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            className="flex-1 h-9 rounded-md bg-sky-500 px-3 text-white font-medium"
            onClick={() => runCta(promo.primaryCta)}
          >
            {promo.primaryCta?.label ?? "Chat"}
          </button>
          {promo.secondaryCta && (
            <button
              className="flex-1 h-9 rounded-md border px-3 font-medium"
              onClick={() => runCta(promo.secondaryCta!)}
            >
              {promo.secondaryCta.label}
            </button>
          )}
        </div>
        <div className="mt-2 text-[11px] text-gray-500">
          Debug nudge (shown because the widget is not embedded or host hasn’t responded yet).
        </div>
      </div>
    </div>
  );
}
