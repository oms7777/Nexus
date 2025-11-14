"use client";

import * as React from "react";
import { Button } from "@workspace/ui/components/button";
import { useSetAtom } from "jotai";
import { screenAtom } from "../../atoms/widget-atoms";

type Props = {
  className?: string;
};

export default function VoiceCallButton({ className }: Props) {
  const setScreen = useSetAtom(screenAtom);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => {
        // On bascule sur l’écran Voice du widget
        setScreen("voice");
      }}
      title="Voice call with AI assistant"
    >
      Voice call with AI assistant
    </Button>
  );
}
