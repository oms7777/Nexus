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

type Cta = Doc<"promos">["primaryCta"];

export default function SmartPromo() {
  const orgId = useAtomValue(organizationIdAtom);
  const sessionId = useAtomValue(contactSessionIdAtomFamily(orgId || ""));
  const setScreen = useSetAtom(screenAtom);
  const setConvId = useSetAtom(conversationIdAtom);
  const setBookingIntent = useSetAtom(bookingIntentAtom);

  const [parentHref, setParentHref] = useState<string>();
  const [hostAck, setHostAck] = useState(false);
  const isEmbedded = typeof window !== "undefined" ? window.parent !== window : false;

  // Settings (privacy/logo fallback)
  const ws = useQuery(
    api.public.widgetSettings.getByOrganizationId,
    orgId ? { organizationId: orgId } : "skip"
  );

  // Org avatars (public)
  const memberAvatars =
    useQuery(api.public.users.listOrgAvatars, orgId ? { organizationId: orgId, limit: 3 } : "skip") ?? [];

  // Page URL (prefer parent)
  const currentUrl =
    typeof window !== "undefined" ? parentHref ?? window.location.href : undefined;
  const utm =
    typeof window !== "undefined" && currentUrl
      ? new URL(currentUrl).searchParams.get("utm_source") || undefined
      : undefined;

  // Promos for page
  const promos =
    useQuery(
      api.public.promos.listForPage,
      orgId && currentUrl ? { organizationId: orgId, currentUrl, utmSource: utm } : "skip"
    ) ?? [];
  const promo: Doc<"promos"> | undefined = useMemo(
    () => (Array.isArray(promos) && promos.length ? promos[0] : undefined),
    [promos]
  );

  // Stable ref for CTA handling
  const promoRef = useRef<Doc<"promos"> | undefined>(undefined);
  useEffect(() => {
    promoRef.current = promo;
  }, [promo]);

  const createConversation = useMutation(api.public.conversations.create);

  // Host -> widget
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type as string | undefined;

      // Any of these confirm the host is listening
      if (
        t === "nexus:host-ack" || 
        t === "nexus:embed-ready" ||
        t === "nexus:parent-location" ||
        t === "nexus:hide-internal-promo"
      ) {
        setHostAck(true);
      }

      if (t === "nexus:parent-location" && typeof e.data.href === "string") {
        setParentHref(e.data.href);
      }

      const p = promoRef.current;
      if (!p) return;
      if (t === "nexus:run-primary-cta" && p.primaryCta) void runCta(p.primaryCta);
      if (t === "nexus:run-secondary-cta" && p.secondaryCta) void runCta(p.secondaryCta);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Fallback payload (so host can always render something)
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

  // Compose outbound payload
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
    return {
      ...fallbackPayload,
      avatars,
      privacyUrl: (ws as any)?.consent?.privacyUrl || (ws as any)?.privacyUrl || undefined,
    };
  };

  // Post promo immediately and once again after a short delay
  useEffect(() => {
    const payload = makePayload();
    window.parent?.postMessage({ type: "nexus:promo", payload }, "*");

    const t = window.setTimeout(() => {
      window.parent?.postMessage({ type: "nexus:promo", payload: makePayload() }, "*");
    }, 800);

    return () => clearTimeout(t);
  }, [promo, memberAvatars, ws, parentHref, fallbackPayload]);

  // CTA helpers
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

  // Only show internal debug if not embedded OR host never responded
  const showInternal = !!promo && (!isEmbedded || !hostAck);
  if (!showInternal) return null;

  return (
    <div className="fixed bottom-4 right-4 w-[320px] rounded-xl border bg-white shadow-lg z-[1000]">
      <div className="p-3">
        {promo?.card?.badgeText && (
          <div className="mb-2 inline-block rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
            {promo.card.badgeText}
          </div>
        )}
        <div className="font-semibold">{promo?.card?.title ?? "Need a hand?"}</div>
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
        <div className="mt-2 text-[11px] text-gray-500">
          Debug nudge (host not detected).
        </div>
      </div>
    </div>
  );
}
