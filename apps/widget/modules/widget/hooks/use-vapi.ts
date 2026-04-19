import Vapi from "@vapi-ai/web";
import { useAtomValue } from "jotai";
import { useEffect, useState, useCallback } from "react";
import { vapiSecretsAtom, widgetSettingsAtom } from "../atoms/widget-atoms";

interface TranscriptMessage {
  role: "user" | "assistant";
  text: string;
}

export const useVapi = () => {
  const vapiSecrets = useAtomValue(vapiSecretsAtom);
  const widgetSettings = useAtomValue(widgetSettingsAtom);

  const [vapi, setVapi] = useState<Vapi | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [callError, setCallError] = useState<string | null>(null);

  // ⚠️ IMPORTANT : dépend de vapiSecrets
  useEffect(() => {
    if (!vapiSecrets?.publicApiKey) {
      setVapi(null);
      return;
    }

    const vapiInstance = new Vapi(vapiSecrets.publicApiKey);
    setVapi(vapiInstance);

    vapiInstance.on("call-start", () => {
      setIsConnected(true);
      setIsConnecting(false);
      setTranscript([]);
    });

    vapiInstance.on("call-end", () => {
      setIsConnected(false);
      setIsConnecting(false);
      setIsSpeaking(false);
    });

    vapiInstance.on("speech-start", () => {
      setIsSpeaking(true);
    });

    vapiInstance.on("speech-end", () => {
      setIsSpeaking(false);
    });

    vapiInstance.on("error", (error) => {
      console.log(error, "VAPI_ERROR");
      const msg =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);
      setCallError(msg || "Voice connection error");
      setIsSpeaking(false);
      setIsConnecting(false);
      setIsConnected(false);
    });

    vapiInstance.on("message", (message) => {
      if (message.type === "transcript" && message.transcriptType === "final") {
        setTranscript((prev) => [
          ...prev,
          {
            role: message.role === "user" ? "user" : "assistant",
            text: message.transcript,
          },
        ]);
      }
    });

    return () => {
      vapiInstance.stop();
      setIsConnected(false);
      setIsConnecting(false);
      setIsSpeaking(false);
      setTranscript([]);
      setCallError(null);
    };
  }, [vapiSecrets]);

  const startCall = useCallback(() => {
    const assistantId = widgetSettings?.vapiSettings?.assistantId;

    if (!vapiSecrets?.publicApiKey) {
      setCallError("Voice is not available yet (missing public key). Check Integrations → Voice.");
      console.warn("Vapi not configured correctly", { hasSecrets: !!vapiSecrets, assistantId });
      return;
    }

    if (!assistantId || assistantId === "none") {
      setCallError("No voice assistant selected. Choose one in Integrations → Voice and save.");
      console.warn("Vapi not configured correctly", { hasSecrets: !!vapiSecrets, assistantId });
      return;
    }

    if (!vapi) {
      console.warn("Vapi client not initialized yet");
      return;
    }

    setCallError(null);
    setIsConnecting(true);

    try {
      vapi.start(assistantId);
    } catch (err) {
      console.error("Error starting Vapi call", err);
      setIsConnecting(false);
      setCallError(err instanceof Error ? err.message : "Could not start voice call.");
    }
  }, [vapi, vapiSecrets, widgetSettings?.vapiSettings?.assistantId]);

  const endCall = useCallback(async () => {
    try {
      vapi?.stop();
    } catch {}
  }, [vapi]);

  return {
    isSpeaking,
    isConnecting,
    isConnected,
    transcript,
    startCall,
    endCall,
    callError,
    clearCallError: () => setCallError(null),
  };
};
