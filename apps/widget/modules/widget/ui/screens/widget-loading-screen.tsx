"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { LoaderIcon } from "lucide-react";
import {
  contactSessionIdAtom,
  conversationIdAtom,
  errorMessageAtom,
  loadingMessageAtom,
  organizationIdAtom,
  screenAtom,
  vapiSecretsAtom,
  widgetSettingsAtom,
} from "../../atoms/widget-atoms";
import { consentGivenAtom, qualifyStepAtom } from "../../atoms/qualify-atoms";
import { WidgetHeader } from "../components/widget-header";
import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

type InitStep = "org" | "session" | "settings" | "vapi" | "done";

function getNoChat(): boolean {
  if (typeof window === "undefined") return false;
  const v = new URLSearchParams(window.location.search).get("nochat");
  return v === "1" || v === "true";
}

function notifyParentSessionReady(params: { organizationId: string; sessionId: string }) {
  if (typeof window === "undefined") return;
  if (!window.parent || window.parent === window) return;

  try {
    window.parent.postMessage(
      { type: "nexus:session-ready", payload: { organizationId: params.organizationId, sessionId: params.sessionId } },
      "*"
    );
  } catch (err) {
    console.error("[widget] failed to post nexus:session-ready", err);
  }
}

export const WidgetLoadingScreen = ({ organizationId }: { organizationId: string | null }) => {
  const [step, setStep] = useState<InitStep>("org");
  const consentGiven = useAtomValue(consentGivenAtom);

  const setWidgetSettings = useSetAtom(widgetSettingsAtom);
  const setOrganizationId = useSetAtom(organizationIdAtom);
  const setErrorMessage = useSetAtom(errorMessageAtom);
  const setLoadingMessage = useSetAtom(loadingMessageAtom);
  const setScreen = useSetAtom(screenAtom);
  const setVapiSecrets = useSetAtom(vapiSecretsAtom);
  const setQualifyStep = useSetAtom(qualifyStepAtom);

  const setConversationId = useSetAtom(conversationIdAtom);

  const contactSessionId = useAtomValue(contactSessionIdAtom);
  const setContactSessionId = useSetAtom(contactSessionIdAtom);

  const validateOrganization = useAction(api.public.organizations.validate);

  // prevent infinite regen loops
  const regeneratedOnceRef = useRef(false);

  /* 1) Validate org */
  useEffect(() => {
    if (step !== "org") return;

    setLoadingMessage("Verifying organization...");

    if (!organizationId) {
      setErrorMessage("Organization ID is required");
      setScreen("error");
      return;
    }

    validateOrganization({ organizationId })
      .then((result) => {
        if (result.valid) {
          setOrganizationId(organizationId);
          setStep("session");
        } else {
          setErrorMessage(result.reason || "Invalid configuration");
          setScreen("error");
        }
      })
      .catch(() => {
        setErrorMessage("Unable to verify organization");
        setScreen("error");
      });
  }, [step, organizationId, validateOrganization, setOrganizationId, setErrorMessage, setScreen, setLoadingMessage]);

  /* 2) Ensure contactSession */
  const validateContactSession = useMutation(api.public.contactSessions.validate);
  const ensureContactSession = useMutation(api.public.contactSessions.ensure);

  useEffect(() => {
    if (step !== "session") return;

    setLoadingMessage("Checking session...");

    if (!organizationId) {
      setErrorMessage("Organization ID is required");
      setScreen("error");
      return;
    }

    const regen = async () => {
      try {
        const id = await ensureContactSession({ organizationId });

        // ✅ critical: wipe conversation bound to previous session
        setConversationId(null);

        setContactSessionId(id);
        notifyParentSessionReady({ organizationId, sessionId: id });
        setStep("settings");
      } catch {
        setErrorMessage("Unable to start a session");
        setScreen("error");
      }
    };

    if (!contactSessionId) {
      void regen();
      return;
    }

    validateContactSession({ contactSessionId })
      .then((res) => {
        if (res.valid) {
          notifyParentSessionReady({ organizationId, sessionId: contactSessionId });
          setStep("settings");
        } else {
          if (regeneratedOnceRef.current) {
            setErrorMessage(res.reason || "Session invalid");
            setScreen("error");
            return;
          }
          regeneratedOnceRef.current = true;
          void regen();
        }
      })
      .catch(() => {
        if (regeneratedOnceRef.current) {
          setErrorMessage("Session invalid");
          setScreen("error");
          return;
        }
        regeneratedOnceRef.current = true;
        void regen();
      });
  }, [
    step,
    organizationId,
    contactSessionId,
    validateContactSession,
    ensureContactSession,
    setContactSessionId,
    setConversationId,
    setLoadingMessage,
    setErrorMessage,
    setScreen,
  ]);

  /* 3) widgetSettings */
  const widgetSettings = useQuery(
    api.public.widgetSettings.getByOrganizationId,
    organizationId ? { organizationId } : "skip"
  );

  useEffect(() => {
    if (widgetSettings === undefined) return;

    setWidgetSettings(widgetSettings);

    try {
      const theme = (widgetSettings as any)?.theme;
      const brandLogoUrl = (widgetSettings as any)?.brandLogoUrl;
      const embedLayout = (widgetSettings as any)?.embedLayout ?? "compact";
      window.parent?.postMessage({ type: "nexus:theme", payload: { theme, brandLogoUrl, embedLayout } }, "*");
    } catch {}

    setStep("vapi");
  }, [widgetSettings, setWidgetSettings]);

  /* 4) Vapi secrets */
  const getVapiSecrets = useAction(api.public.secrets.getVapiSecrets);

  useEffect(() => {
    if (step !== "vapi") return;

    if (!organizationId) {
      setErrorMessage("Organization ID is required");
      setScreen("error");
      return;
    }

    setLoadingMessage("Loading voice features...");
    getVapiSecrets({ organizationId })
      .then((secrets) => {
        setVapiSecrets(secrets);
        setStep("done");
      })
      .catch(() => {
        setVapiSecrets(null);
        setStep("done");
      });
  }, [step, organizationId, getVapiSecrets, setVapiSecrets, setLoadingMessage, setErrorMessage, setScreen]);

  /* 5) route to chat */
  useEffect(() => {
    if (step !== "done") return;

    // Soft-consent: démarrer directement sur l'état "idle"
    setQualifyStep("idle");

    // ✅ your behavior
    setScreen("chat");
    if (getNoChat()) setScreen("chat");

    // Notify embed that widget is ready (for pending "Book a meeting" etc.)
    try {
      window.parent?.postMessage({ type: "nexus:widget-ready" }, "*");
    } catch {}
  }, [step, consentGiven, setQualifyStep, setScreen]);

  const loadingMessage = useAtomValue(loadingMessageAtom);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground">
      <LoaderIcon className="h-4 w-4 animate-spin" />
      {loadingMessage ? (
        <p className="mt-2 text-xs">{loadingMessage}</p>
      ) : null}
    </div>
  );
};
