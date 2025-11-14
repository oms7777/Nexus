"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useAtomValue, useSetAtom } from "jotai";
import { HomeIcon, InboxIcon } from "lucide-react";
import { screenAtom } from "../../atoms/widget-atoms";
import BookDemoButton from "./BookDemoButton";
import VoiceCallButton from "./VoiceCallButton";

export const WidgetFooter = () => {
  const screen = useAtomValue(screenAtom);
  const setScreen = useSetAtom(screenAtom);

  return (
    <footer className="flex items-center justify-between border-t bg-background">
      {/* Bouton Home */}
      <Button
        className="h-14 flex-1 rounded-none"
        onClick={() => setScreen("selection")}
        size="icon"
        variant="ghost"
      >
        <HomeIcon
          className={cn(
            "size-5",
            screen === "selection" && "text-primary"
          )}
        />
      </Button>

      {/* Zone centrale : Voice + Book a demo */}
      <div className="h-14 flex flex-[2] items-center justify-center gap-2 px-2">
        <VoiceCallButton className="h-9 rounded-full px-4 text-xs font-medium" />
        <BookDemoButton className="h-9 rounded-full px-4 text-xs font-medium">
          Book a demo
        </BookDemoButton>
      </div>

      {/* Bouton Inbox */}
      <Button
        className="h-14 flex-1 rounded-none"
        onClick={() => setScreen("inbox")}
        size="icon"
        variant="ghost"
      >
        <InboxIcon
          className={cn("size-5", screen === "inbox" && "text-primary")}
        />
      </Button>
    </footer>
  );
};
