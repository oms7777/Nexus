"use client";

import { Button } from "@workspace/ui/components/button";
import { MicIcon } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";

import { screenAtom } from "../../atoms/widget-atoms";
import {
  bookingIntentAtom,
  qualifyStepAtom,
  consentGivenAtom,
} from "../../atoms/qualify-atoms";

type Props = { className?: string };

export default function VoiceCallButton({ className }: Props) {
  const setScreen = useSetAtom(screenAtom);
  const setBookingIntent = useSetAtom(bookingIntentAtom);
  const setQualifyStep = useSetAtom(qualifyStepAtom);

  const consentGiven = useAtomValue(consentGivenAtom);

  /**
   * ✅ VOICE (CONSENT-GATED)
   * - SI CONSENT OK => VOICE DIRECT
   * - SINON => CONSENT DANS CHAT + FLAG POUR REDIRIGER VERS VOICE APRÈS ACCEPT
   */
  const onClick = () => {
    if (consentGiven) {
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
    <Button
      variant="transparent"
      size="icon"
      className={className}
      onClick={onClick}
      title="Voice call with AI assistant"
    >
      <MicIcon className="size-5" />
    </Button>
  );
}
