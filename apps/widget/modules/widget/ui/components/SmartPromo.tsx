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
import { Button } from "@workspace/ui/components/button";
import { X } from "lucide-react";
import type { Doc } from "@workspace/backend/_generated/dataModel";

export default function SmartPromo() {
  const orgId = useAtomValue(organizationIdAtom);
  const sessionId = useAtomValue(contactSessionIdAtomFamily(orgId || ""));
  const setScreen = useSetAtom(screenAtom);
  const setConvId = useSetAtom(conversationIdAtom);
  const setBookingIntent = useSetAtom(bookingIntentAtom);

  const [hidden, setHidden] = useState(false);
  const [closing, setClosing] = useState(false);
  const [parentHref, setParentHref] = useState<string | undefined>(undefined);

  // reçoit l'URL du parent
  useEffect(() => {
    function onParentLoc(e: MessageEvent) {
      if (e.data?.type === "nexus:parent-location" && typeof e.data.href === "string") {
        setParentHref(e.data.href);
      }
      if (e.data?.type === "nexus:hide-internal-promo") {
        setHidden(true);
      }
    }
    window.addEventListener("message", onParentLoc);
    return () => window.removeEventListener("message", onParentLoc);
  }, []);

  const currentUrl =
    typeof window !== "undefined" ? (parentHref ?? window.location.href) : undefined;

  const utm =
    typeof window !== "undefined" && currentUrl
      ? new URL(currentUrl).searchParams.get("utm_source") || undefined
      : undefined;

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

  // 1) pousser la promo au parent
  useEffect(() => {
    if (!promo) return;
    const payload = {
      title: promo.card?.title || "Need a hand?",
      body: promo.card?.body || "Chat with our assistant or book a 15-min demo.",
      primary: promo.primaryCta?.label || "Chat",
      secondary: promo.secondaryCta?.label || "Book a demo",
      primaryCta: promo.primaryCta,
      secondaryCta: promo.secondaryCta,
    };
    window.parent?.postMessage({ type: "nexus:promo", payload }, "*");
  }, [promo, parentHref]);

  // 2) exécuter les CTA déclenchées par le nudge
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const t = e.data?.type;
      if (!promo) return;
      if (t === "nexus:run-primary-cta" && promo.primaryCta) {
        void runCta(promo.primaryCta);
      }
      if (t === "nexus:run-secondary-cta" && promo.secondaryCta) {
        void runCta(promo.secondaryCta);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [promo]);

  if (hidden || !promo) return null;

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
      /* ignore */
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

  const handleClose = () => {
    setClosing(true);
    window.setTimeout(() => setHidden(true), 220);
  };

  return (
    <div
      className={[
        "fixed bottom-16 right-4 z-100 w-[320px] rounded-xl border bg-white shadow-lg transition-all duration-200",
        closing ? "opacity-0 translate-y-2 pointer-events-none" : "opacity-100 translate-y-0",
      ].join(" ")}
    >
      <div className="relative p-3">
        <button
          onClick={handleClose}
          className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
          aria-label="Close promo"
        >
          <X className="h-4 w-4" />
        </button>

        <button
          onClick={() => {
            setBookingIntent("none");
            void goChat();
          }}
          className="absolute -left-3 -top-3 grid h-10 w-10 place-items-center rounded-full border bg-white shadow"
          aria-label="Open chat"
        >
          <img src="/logo.svg" alt="logo" className="h-6 w-6" />
        </button>

        {promo.card?.badgeText && (
          <div className="mb-2 inline-block rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
            {promo.card.badgeText}
          </div>
        )}

        <div className="font-semibold">{promo.card.title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{promo.card.body}</div>

        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => runCta(promo.primaryCta)}>
            {promo.primaryCta.label}
          </Button>
          {promo.secondaryCta && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => runCta(promo.secondaryCta!)}
            >
              {promo.secondaryCta.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
