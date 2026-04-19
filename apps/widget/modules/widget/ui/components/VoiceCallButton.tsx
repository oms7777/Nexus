"use client";

import { MicIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";

import { cn } from "@workspace/ui/lib/utils";

import { screenAtom } from "../../atoms/widget-atoms";
import {
  bookingIntentAtom,
  qualifyStepAtom,
  consentGivenAtom,
} from "../../atoms/qualify-atoms";

type Props = {
  className?: string;
  /** Subtle pulse + ring for a few seconds to draw attention (visitor guidance). */
  attentionPulse?: boolean;
  /**
   * When true (default), opening voice requires prior consent if the visitor has not consented yet
   * (sessionStorage + consent step). Set to false when the org has no consent gate — otherwise the mic
   * appears to do nothing.
   */
  gateVoiceOnConsent?: boolean;
};

export default function VoiceCallButton({
  className,
  attentionPulse = true,
  gateVoiceOnConsent = true,
}: Props) {
  const setScreen = useSetAtom(screenAtom);
  const setBookingIntent = useSetAtom(bookingIntentAtom);
  const setQualifyStep = useSetAtom(qualifyStepAtom);

  const consentGiven = useAtomValue(consentGivenAtom);

  const [pulseOn, setPulseOn] = useState(attentionPulse);

  useEffect(() => {
    if (!attentionPulse) {
      setPulseOn(false);
      return;
    }
    const id = window.setTimeout(() => setPulseOn(false), 12000);
    return () => window.clearTimeout(id);
  }, [attentionPulse]);

  /**
   * Voice (consent-gated): consent OK → voice screen; otherwise chat + redirect after consent.
   */
  const onClick = () => {
    setPulseOn(false);
    if (!gateVoiceOnConsent || consentGiven) {
      setScreen("voice");
      return;
    }

    try {
      sessionStorage.setItem("nexus:after-consent", "voice");
    } catch {}

    setBookingIntent("chat");
    setQualifyStep("consent" as any);
    setScreen("chat");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title="Voice call with AI assistant"
      aria-label="Voice call with AI assistant"
      className={cn(
        "size-9 flex shrink-0 items-center justify-center rounded-full border border-white/20 shadow-md transition-all hover:scale-[1.03] active:scale-[0.98]",
        pulseOn && "animate-pulse shadow-[0_0_0_3px_rgba(99,102,241,0.45)]",
        className
      )}
      style={{
        backgroundColor: "var(--widget-primary)",
        color: "var(--widget-primary-text)",
      }}
    >
      <MicIcon className="size-4" aria-hidden />
    </button>
  );
}
