// apps/widget/modules/widget/components/SmartPromo.tsx
"use client";

import { useEffect, useState } from "react";
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
  const screen = useAtomValue(screenAtom);
  const setScreen = useSetAtom(screenAtom);
  const setConvId = useSetAtom(conversationIdAtom);
  const setBookingIntent = useSetAtom(bookingIntentAtom);

  const [hidden, setHidden] = useState(false);
  const [closing, setClosing] = useState(false);

  // Don’t compute URL in SSR
  const currentUrl = typeof window !== "undefined" ? window.location.href : undefined;
  const utm = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("utm_source") || undefined
    : undefined;

  // If orgId or currentUrl missing, skip
  const promos =
    useQuery(
      api.public.promos.listForPage,
      orgId && currentUrl ? { organizationId: orgId, currentUrl, utmSource: utm } : "skip"
    ) ?? [];

  const createConversation = useMutation(api.public.conversations.create);

  // Auto-hide when chat opens
  useEffect(() => {
    if (screen === "chat" && !hidden) setHidden(true);
  }, [screen, hidden]);

  if (hidden || !Array.isArray(promos) || promos.length === 0) return null;
  const p: Doc<"promos"> | undefined = promos[0];
  if (!p) return null;

  const goChat = async () => {
    setHidden(true);
    setScreen("chat");
    if (orgId && sessionId) {
      try {
        const id = await createConversation({ organizationId: orgId, contactSessionId: sessionId });
        setConvId(id);
      } catch {
        /* ignore */
      }
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
        "fixed bottom-16 right-4 z-50 w-[320px] rounded-xl border bg-white shadow-lg transition-all duration-200",
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

        {p.card?.badgeText && (
          <div className="mb-2 inline-block rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
            {p.card.badgeText}
          </div>
        )}

        <div className="font-semibold">{p.card.title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{p.card.body}</div>

        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => runCta(p.primaryCta)}>
            {p.primaryCta.label}
          </Button>
          {p.secondaryCta && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => runCta(p.secondaryCta!)}
            >
              {p.secondaryCta.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
