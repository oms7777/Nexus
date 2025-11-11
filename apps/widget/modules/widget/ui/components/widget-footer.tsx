"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useAtomValue, useSetAtom } from "jotai";
import { HomeIcon, InboxIcon } from "lucide-react";
import { screenAtom } from "../../atoms/widget-atoms";
// import BookDemoButton from "./BookDemoButton"; // ⬅️ intentionally removed

export const WidgetFooter = () => {
  const screen = useAtomValue(screenAtom);
  const setScreen = useSetAtom(screenAtom);

  // Optional feature flag to temporarily bring back a footer CTA in dev
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

      {/* ❌ Keep empty unless you explicitly enable NEXT_PUBLIC_SHOW_FOOTER_BOOK_CTA */}
      {showFooterBookCta && (
        <div className="h-14 flex-1 rounded-none flex items-center justify-center">
          {/* <BookDemoButton /> */}
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
