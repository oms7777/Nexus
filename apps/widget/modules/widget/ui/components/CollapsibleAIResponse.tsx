"use client";

import { useState } from "react";
import { AIResponse } from "@workspace/ui/components/ai/response";
import { cn } from "@workspace/ui/lib/utils";

const COLLAPSE_CHAR_THRESHOLD = 450;
const COLLAPSED_MAX_HEIGHT = 180;

export function CollapsibleAIResponse({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > COLLAPSE_CHAR_THRESHOLD;

  if (!isLong) {
    return (
      <div className={className}>
        <AIResponse>{text}</AIResponse>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "overflow-hidden transition-[max-height] duration-200 ease-out",
          expanded ? "max-h-none" : ""
        )}
        style={!expanded ? { maxHeight: COLLAPSED_MAX_HEIGHT } : undefined}
      >
        <AIResponse>{text}</AIResponse>
      </div>
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs font-medium text-muted-foreground underline hover:text-foreground transition-colors"
        >
          Voir plus
        </button>
      )}
    </div>
  );
}
