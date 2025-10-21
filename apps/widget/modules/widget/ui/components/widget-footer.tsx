"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useAtomValue, useSetAtom } from "jotai";
import { HomeIcon, InboxIcon } from "lucide-react";
import { screenAtom } from "../../atoms/widget-atoms";
// import BookDemoButton from "./BookDemoButton"; // ⬅️ supprimé

export const WidgetFooter = () => {
  const screen = useAtomValue(screenAtom);
  const setScreen = useSetAtom(screenAtom);

  // Optionnel: laisser un flag pour le remettre en dev si nécessaire
  const showFooterBookCta =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_SHOW_FOOTER_BOOK_CTA === "1";

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

      {/* ❌ CTA Book a demo retiré pour ne pas dupliquer la SmartPromo */}
      {showFooterBookCta && (
        <div className="h-14 flex-1 rounded-none flex items-center justify-center">
          {/* <BookDemoButton>...</BookDemoButton> */}
        </div>
      )}

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
