"use client";

import { Button } from "@workspace/ui/components/button";
import { MicIcon } from "lucide-react";
import { useSetAtom } from "jotai";
import { screenAtom } from "../../atoms/widget-atoms";

type Props = { className?: string };

export default function VoiceCallButton({ className }: Props) {
  const setScreen = useSetAtom(screenAtom);

  return (
    <Button
      variant="transparent"
      size="icon"
      className={className}
      onClick={() => setScreen("voice")}
      title="Voice call with AI assistant"
    >
      <MicIcon className="size-5" />
    </Button>
  );
}
