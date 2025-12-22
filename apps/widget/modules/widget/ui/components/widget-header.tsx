// apps/widget/modules/widget/ui/components/widget-header.tsx
import { cn } from "@workspace/ui/lib/utils";
import React from "react";

export const WidgetHeader = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <header
      className={cn(
        // ✅ suit automatiquement --primary / --primary-foreground
        "bg-primary text-primary-foreground p-4",
        className
      )}
    >
      {children}
    </header>
  );
};
