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
    };
  }, [vapiSecrets]);

  const startCall = useCallback(() => {
    const assistantId = widgetSettings?.vapiSettings?.assistantId;

    // si mauvaise config → on NE bloque PAS le bouton
    if (!vapiSecrets?.publicApiKey || !assistantId || assistantId === "none") {
      console.warn("Vapi not configured correctly", {
        hasSecrets: !!vapiSecrets,
        assistantId,
      });
      return;
    }

    if (!vapi) {
      console.warn("Vapi client not initialized yet");
      return;
    }

    setIsConnecting(true);

    try {
      vapi.start(assistantId);
    } catch (err) {
      console.error("Error starting Vapi call", err);
      setIsConnecting(false);
    }
  }, [vapi, vapiSecrets, widgetSettings?.vapiSettings?.assistantId]);

  const endCall = useCallback(() => {
    if (vapi) {
      vapi.stop();
    }
  }, [vapi]);

  return {
    isSpeaking,
    isConnecting,
    isConnected,
    transcript,
    startCall,
    endCall,
  };
};
