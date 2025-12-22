// apps/widget/modules/widget/ui/components/widget-header.tsx
"use client";

import React from "react";
import { cn } from "@workspace/ui/lib/utils";

export const WidgetHeader = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <header
      className={cn("p-4", className)}
      style={{
        background: "var(--widget-primary)",
        color: "var(--widget-primary-text)",
      }}
    >
      {children}
    </header>
  );
};
