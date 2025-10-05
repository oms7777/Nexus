"use client";

import * as React from "react";
import { Button } from "@workspace/ui/components/button";

type Props = {
  children?: React.ReactNode;
  className?: string;
};

export default function BookDemoButton({ children, className }: Props) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className={className}
      onClick={() => {
        // forward any known prefill (you can set this when user authenticates)
        const prefill = (window as any).__nexusContact || {};
        window.dispatchEvent(new CustomEvent("nexus:open-qualify", { detail: prefill }));
      }}
      title="Book a demo"
    >
      {children ?? "Book"}
    </Button>
  );
}
