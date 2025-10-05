"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useAtomValue, useSetAtom } from "jotai";
import { HomeIcon, InboxIcon, CalendarIcon } from "lucide-react";
import { screenAtom } from "../../atoms/widget-atoms";
import BookDemoButton from "./BookDemoButton";


export const WidgetFooter = () => {
  const screen = useAtomValue(screenAtom);
  const setScreen = useSetAtom(screenAtom);

  return (
    <footer className="flex items-center justify-between border-t bg-background">
      <Button
        className="h-14 flex-1 rounded-none"
        onClick={() => setScreen("selection")}
        size="icon"
        variant="ghost"
      >
        <HomeIcon className={cn("size-5", screen === "selection" && "text-primary")} />
      </Button>

      {/* ⬇️ CTA Book a demo au centre */}
      <div className="h-14 flex-1 rounded-none flex items-center justify-center">
        <BookDemoButton>
          <CalendarIcon className="size-5" />
          <span className="sr-only">Book a demo</span>
        </BookDemoButton>
      </div>
 
      <Button
        className="h-14 flex-1 rounded-none"
        onClick={() => setScreen("inbox")}
        size="icon"
        variant="ghost"
      >
        <InboxIcon className={cn("size-5", screen === "inbox" && "text-primary")} />
      </Button>
    </footer>
  );
};
