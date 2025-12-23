"use client";

/**
 * WidgetLoadingScreen
 * -------------------
 * Rôle :
 * - Valide organizationId
 * - Garantit une contactSession (mais ne crée PAS de conversation)
 * - Charge widgetSettings + secrets Vapi
 * - Redirige :
 *    - par défaut => écran "chat"
 *    - ?nochat=1 => écran "selection" (debug)
 *
 * Changement clé :
 * - On ne ré-impose PLUS "consent" si le consent a déjà été donné.
 *
 * - NOUVEAU :
 *   Quand la contactSession est prête, on envoie un postMessage au parent
 *   pour qu’il démarre rrweb + Pusher côté PAGE host :
 *
 *      window.parent.postMessage(
 *        { type: "nexus:session-ready", payload: { sessionId, organizationId } },
 *        "*"
 *      );
 */

import { useAtomValue, useSetAtom } from "jotai";
import { LoaderIcon } from "lucide-react";
import {
  contactSessionIdAtomFamily,
  errorMessageAtom,
  loadingMessageAtom,
  organizationIdAtom,
  screenAtom,
  vapiSecretsAtom,
  widgetSettingsAtom,
} from "../../atoms/widget-atoms";
import { consentGivenAtom, qualifyStepAtom } from "../../atoms/qualify-atoms";
import { WidgetHeader } from "../components/widget-header";
import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

type InitStep = "org" | "session" | "settings" | "vapi" | "done";

/** ?nochat=1 => on reste sur l’écran de sélection pour debug */
function getNoChat(): boolean {
  if (typeof window === "undefined") return false;
  const v = new URLSearchParams(window.location.search).get("nochat");
  return v === "1" || v === "true";
}

/**
 * Informe la page host (embed.js) que la session est prête.
 * C’est la page host qui démarrera rrweb + Pusher.
 */
function notifyParentSessionReady(params: {
  organizationId: string;
  sessionId: string;
}) {
  if (typeof window === "undefined") return;
  if (!window.parent || window.parent === window) return;

  const { organizationId, sessionId } = params;

  try {
    window.parent.postMessage(
      {
        type: "nexus:session-ready",
        payload: { organizationId, sessionId },
      },
      "*"
    );
  } catch (err) {
    console.error("[widget] failed to post nexus:session-ready", err);
  }
}

export const WidgetLoadingScreen = ({
  organizationId,
}: {
  organizationId: string | null;
}) => {
  const [step, setStep] = useState<InitStep>("org");

  const loadingMessage = useAtomValue(loadingMessageAtom);
  const consentGiven = useAtomValue(consentGivenAtom);

  const setWidgetSettings = useSetAtom(widgetSettingsAtom);
  const setOrganizationId = useSetAtom(organizationIdAtom);
  const setErrorMessage = useSetAtom(errorMessageAtom);
  const setLoadingMessage = useSetAtom(loadingMessageAtom);
  const setScreen = useSetAtom(screenAtom);
  const setVapiSecrets = useSetAtom(vapiSecretsAtom);
  const setQualifyStep = useSetAtom(qualifyStepAtom);

  const contactSessionId = useAtomValue(
    contactSessionIdAtomFamily(organizationId || "")
  );
  const setContactSessionId = useSetAtom(
    contactSessionIdAtomFamily(organizationId || "")
  );

  /* 1) Valider l’org */
  const validateOrganization = useAction(api.public.organizations.validate);

  useEffect(() => {
    if (step !== "org") return;

    setLoadingMessage("Finding organization ID...");

    if (!organizationId) {
      setErrorMessage("Organization ID is required");
      setScreen("error");
      return;
    }

    setLoadingMessage("Verifying organization...");
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
  }, [
    step,
    organizationId,
    setErrorMessage,
    setScreen,
    setOrganizationId,
    validateOrganization,
    setLoadingMessage,
  ]);

  /* 2) S’assurer d’avoir une session (mais pas de conversation) */
  const validateContactSession = useMutation(
    api.public.contactSessions.validate
  );
  const ensureContactSession = useMutation(api.public.contactSessions.ensure);

  useEffect(() => {
    if (step !== "session") return;

    setLoadingMessage("Checking session...");

    if (!organizationId) {
      setErrorMessage("Organization ID is required");
      setScreen("error");
      return;
    }

    const notifyIfNeeded = (sessionId: string) => {
      notifyParentSessionReady({ organizationId, sessionId });
    };

    const ensure = async () => {
      try {
        const id = await ensureContactSession({ organizationId });
        setContactSessionId(id);
        notifyIfNeeded(id);
        setStep("settings");
      } catch {
        setErrorMessage("Unable to start a session");
        setScreen("error");
      }
    };

    if (!contactSessionId) {
      void ensure();
      return;
    }

    validateContactSession({ contactSessionId })
      .then((res) => {
        if (res.valid) {
          notifyIfNeeded(contactSessionId);
          setStep("settings");
        } else {
          ensure();
        }
      })
      .catch(() => ensure());
  }, [
    step,
    contactSessionId,
    organizationId,
    validateContactSession,
    ensureContactSession,
    setContactSessionId,
    setLoadingMessage,
    setErrorMessage,
    setScreen,
  ]);

  /* 3) Charger les widgetSettings */
  const widgetSettings = useQuery(
    api.public.widgetSettings.getByOrganizationId,
    organizationId ? { organizationId } : "skip"
  );

  useEffect(() => {
    if (widgetSettings !== undefined) {
      setWidgetSettings(widgetSettings);

      // 🔥 envoyer le thème AU PARENT immédiatement
      try {
        const theme = (widgetSettings as any)?.theme;
        const brandLogoUrl = (widgetSettings as any)?.brandLogoUrl;

        window.parent?.postMessage(
          { type: "nexus:theme", payload: { theme, brandLogoUrl } },
          "*"
        );
      } catch {}

      setStep("vapi");
    }
  }, [widgetSettings, setWidgetSettings]);

  /* 4) Charger les secrets Vapi (si présents) */
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
  }, [
    step,
    organizationId,
    getVapiSecrets,
    setVapiSecrets,
    setLoadingMessage,
    setScreen,
    setErrorMessage,
  ]);

  /* 5) Aller à l’écran chat (ou selection), SANS ré-imposer le consent si déjà donné */
  useEffect(() => {
    if (step !== "done") return;

    if (getNoChat()) {
      setScreen("selection");
      return;
    }

    // ✅ IMPORTANT : si consent déjà donné, on revient en idle (chat direct)
    // sinon on force consent (comportement normal)
    setQualifyStep(consentGiven ? "idle" : "consent");
    setScreen("chat");
  }, [step, consentGiven, setQualifyStep, setScreen]);

  return (
    <>
      <WidgetHeader>
        <div className="flex flex-col justify-between gap-y-2 px-2 py-6 font-semibold">
          <p className="text-3xl">Hi there!</p>
          <p className="text-lg">Let&apos;s get you started</p>
        </div>
      </WidgetHeader>

      <div className="flex flex-1 flex-col items-center justify-center gap-y-4 p-4 text-muted-foreground">
        <LoaderIcon className="animate-spin" />
        <p className="text-sm">{loadingMessage || "Loading..."}</p>
      </div>
    </>
  );
};
