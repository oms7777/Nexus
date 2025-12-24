"use client";

import { useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useMutation } from "convex/react";
import { ChevronRightIcon, MessageSquareTextIcon, MicIcon } from "lucide-react";

import { api } from "@workspace/backend/_generated/api";
import { Button } from "@workspace/ui/components/button";
import { WidgetHeader } from "../components/widget-header";

import {
  contactSessionIdAtomFamily,
  conversationIdAtom,
  errorMessageAtom,
  hasVapiSecretsAtom,
  organizationIdAtom,
  screenAtom,
  widgetSettingsAtom,
} from "../../atoms/widget-atoms";

import {
  bookingIntentAtom,
  qualifyStepAtom,
  consentGivenAtom,
} from "../../atoms/qualify-atoms";

export const WidgetSelectionScreen = () => {
  const setScreen = useSetAtom(screenAtom);
  const setErrorMessage = useSetAtom(errorMessageAtom);
  const setConversationId = useSetAtom(conversationIdAtom);

  const setBookingIntent = useSetAtom(bookingIntentAtom);
  const setQualifyStep = useSetAtom(qualifyStepAtom);

  const widgetSettings = useAtomValue(widgetSettingsAtom);
  const hasVapiSecrets = useAtomValue(hasVapiSecretsAtom);
  const organizationId = useAtomValue(organizationIdAtom);

  const consentGiven = useAtomValue(consentGivenAtom);

  const contactSessionId = useAtomValue(
    contactSessionIdAtomFamily(organizationId || "")
  );
  const setContactSessionId = useSetAtom(
    contactSessionIdAtomFamily(organizationId || "")
  );

  const createConversation = useMutation(api.public.conversations.create);
  const ensureContactSession = useMutation(api.public.contactSessions.ensure);

  const [isPending, setIsPending] = useState(false);

  /**
   * ✅ START CHAT (DEBUG SCREEN)
   * - CRÉE SESSION + CONVERSATION
   * - OUVRE CHAT
   */
  const handleNewConversation = async () => {
    if (!organizationId) {
      setScreen("error");
      setErrorMessage("Missing Organization ID");
      return;
    }

    setIsPending(true);
    try {
      const sessionId =
        contactSessionId || (await ensureContactSession({ organizationId }));

      setContactSessionId(sessionId);

      const cid = await createConversation({
        contactSessionId: sessionId,
        organizationId,
      });

      setConversationId(cid);
      setScreen("chat");
    } catch (err) {
      console.error(err);
      setErrorMessage("Unable to start chat");
      setScreen("error");
    } finally {
      setIsPending(false);
    }
  };

  /**
   * ✅ START VOICE (CONSENT-GATED)
   * - SI CONSENT OK => SCREEN "VOICE"
   * - SINON => SCREEN "CHAT" + STEP "CONSENT" + FLAG "AFTER CONSENT => VOICE"
   */
  const handleStartVoice = () => {
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
    <>
      <WidgetHeader>
        <div className="flex flex-col justify-between gap-y-2 px-2 py-6 font-semibold">
          <p className="text-3xl">Hi there!</p>
          <p className="text-lg">Let&apos;s get you started</p>
        </div>
      </WidgetHeader>

      <div className="flex flex-1 flex-col gap-y-4 p-4 overflow-y-auto">
        {/* ÉCRAN DE SÉLECTION MANUEL (DEBUG / NOCHAT=1) */}
        <Button
          className="h-16 w-full justify-between"
          variant="outline"
          onClick={handleNewConversation}
          disabled={isPending}
        >
          <div className="flex items-center gap-x-2">
            <MessageSquareTextIcon className="size-4" />
            <span>Start chat</span>
          </div>
          <ChevronRightIcon />
        </Button>

        {hasVapiSecrets && widgetSettings?.vapiSettings?.assistantId && (
          <Button
            className="h-16 w-full justify-between"
            variant="outline"
            onClick={handleStartVoice}
            disabled={isPending}
          >
            <div className="flex items-center gap-x-2">
              <MicIcon className="size-4" />
              <span>Start voice call</span>
            </div>
            <ChevronRightIcon />
          </Button>
        )}
      </div>
    </>
  );
};
