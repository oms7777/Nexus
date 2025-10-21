"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";

type LinkMode = "link" | "modal";

export function ConsentCard({
  title,
  intro,
  body,
  linkMode = "link",
  privacyUrl,
  modalContent,
  acceptLabel = "✓ I consent",
  onAccept,
}: {
  title: string;
  intro?: string;
  body?: string;
  linkMode?: LinkMode;
  privacyUrl?: string;   // required if linkMode="link"
  modalContent?: string; // required if linkMode="modal"
  acceptLabel?: string;
  onAccept: () => void;
}) {
  return (
    <div className="mx-2 my-2 rounded-xl border bg-background p-3 shadow-sm">
      <div className="space-y-2 text-sm">
        <p className="font-medium">{title}</p>
        {intro && <p className="text-muted-foreground">{intro}</p>}

        <p className="text-muted-foreground">
          {body ||
            "Before we begin, you need to provide consent to data processing that may occur in your chat session."}{" "}
          {linkMode === "link" && privacyUrl ? (
            <>
              I hereby consent to processing of my personal data collected in the chat in accordance with the rules described{" "}
              <a href={privacyUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:opacity-80">
                here
              </a>.
            </>
          ) : (
            <Dialog>
              <DialogTrigger asChild>
                <button className="underline underline-offset-2 hover:opacity-80">here</button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {modalContent?.trim() ||
                    (body?.trim() || "Details about how your data may be processed.") +
                      "\n\nYou can withdraw your consent at any time."}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </p>
      </div>

      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={onAccept}>
          {acceptLabel}
        </Button>
        {/* No decline button by design */}
      </div>
    </div>
  );
}
