"use client";

import { Button } from "@workspace/ui/components/button";
import { WidgetHeader } from "../components/widget-header";
import { ChevronRightIcon, MessageSquareTextIcon, MicIcon } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  contactSessionIdAtomFamily,
  conversationIdAtom,
  errorMessageAtom,
  hasVapiSecretsAtom,
  organizationIdAtom,
  screenAtom,
  widgetSettingsAtom,
} from "../../atoms/widget-atoms";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useEffect, useRef, useState } from "react";
import { WidgetFooter } from "../components/widget-footer";

export const WidgetSelectionScreen = () => {
  const setScreen = useSetAtom(screenAtom);
  const setErrorMessage = useSetAtom(errorMessageAtom);
  const setConversationId = useSetAtom(conversationIdAtom);

  const widgetSettings = useAtomValue(widgetSettingsAtom);
  const hasVapiSecrets = useAtomValue(hasVapiSecretsAtom);
  const organizationId = useAtomValue(organizationIdAtom);
  const contactSessionId = useAtomValue(
    contactSessionIdAtomFamily(organizationId || "")
  );
  const setContactSessionId = useSetAtom(
    contactSessionIdAtomFamily(organizationId || "")
  );

  const createConversation = useMutation(api.public.conversations.create);
  const ensureContactSession = useMutation(api.public.contactSessions.ensure);
  const [isPending, setIsPending] = useState(false);

  const handleNewConversation = async () => {
    if (!organizationId) {
      setScreen("error");
      setErrorMessage("Missing Organization ID");
      return;
    }
    setIsPending(true);
    try {
      const sessionId =
        contactSessionId ||
        (await ensureContactSession({ organizationId }));
      setContactSessionId(sessionId);

      const conversationId = await createConversation({
        contactSessionId: sessionId,
        organizationId,
      });
      setConversationId(conversationId);
      setScreen("chat");
    } catch (err) {
      console.error(err);
      setErrorMessage("Unable to start chat");
      setScreen("error");
    } finally {
      setIsPending(false);
    }
  };

  // In prod, auto-start so the widget is ready when SmartPromo opens it
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    void handleNewConversation();
  }, []); // once

  const isDev = process.env.NODE_ENV === "development";

  return (
    <>
      <WidgetHeader>
        <div className="flex flex-col justify-between gap-y-2 px-2 py-6 font-semibold">
          <p className="text-3xl">Hi there!</p>
          <p className="text-lg">Let&apos;s get you started</p>
        </div>
      </WidgetHeader>

      <div className="flex flex-1 flex-col gap-y-4 p-4 overflow-y-auto">
        {isDev && (
          <>
            <Button
              className="h-16 w-full justify-between"
              variant="outline"
              onClick={handleNewConversation}
              disabled={isPending}
            >
              <div className="flex items-center gap-x-2">
                <MessageSquareTextIcon className="size-4" />
                <span>Start Chat</span>
              </div>
              <ChevronRightIcon />
            </Button>

            {hasVapiSecrets && widgetSettings?.vapiSettings?.assistantId && (
              <Button
                className="h-16 w-full justify-between"
                variant="outline"
                onClick={() => setScreen("voice")}
                disabled={isPending}
              >
                <div className="flex items-center gap-x-2">
                  <MicIcon className="size-4" />
                  <span>Start voice call</span>
                </div>
                <ChevronRightIcon />
              </Button>
            )}
          </>
        )}
      </div>

      <WidgetFooter />
    </>
  );
};
