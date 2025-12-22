import type { HTMLAttributes } from "react";
import { cn } from "@workspace/ui/lib/utils";

export type AIMessageContentProps = HTMLAttributes<HTMLDivElement>;

export const AIMessageContent = ({
  children,
  className,
  ...props
}: AIMessageContentProps) => {
  return (
    <div
      className={cn(
        "break-words",
        "flex flex-col gap-2 rounded-lg border border-border px-3 py-2 text-sm",
        // assistant default
        "bg-background text-foreground",
        // user bubble: remove border color
        "group-[.is-user]:border-transparent",
        className
      )}
      // ✅ Force user colors from widget CSS vars
      style={{
        ...(props.style || {}),
        // if parent has class "is-user", CSS var should apply
      }}
      {...props}
    >
      <div
        className={cn(
          "whitespace-pre-wrap",
          // ✅ apply only when user message container
          "group-[.is-user]:[background:var(--widget-primary)]",
          "group-[.is-user]:[color:var(--widget-primary-text)]"
        )}
        style={{
          // important: this wrapper ensures the bg really applies
          borderRadius: 8,
          padding: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
};
