"use client";

import { api } from "@workspace/backend/_generated/api";
import { usePaginatedQuery } from "convex/react";
import { MessageSquareIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Inbox home (`/conversations`): open the newest active thread or show an empty state.
 * The list stays in ConversationsLayout's left panel.
 */
export const ConversationsView = () => {
  const router = useRouter();

  const conversations = usePaginatedQuery(
    api.private.conversations.getMany,
    {
      statusIn: ["unresolved", "escalated"],
    },
    { initialNumItems: 1 },
  );

  const firstId = conversations.results[0]?._id;
  const isLoading = conversations.status === "LoadingFirstPage";

  useEffect(() => {
    if (isLoading || !firstId) return;
    router.replace(`/conversations/${firstId}`);
  }, [isLoading, firstId, router]);

  if (isLoading || firstId) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-sm text-muted-foreground">
        {isLoading ? "Loading conversations…" : "Opening conversation…"}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
        <MessageSquareIcon className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">No active conversations</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          When visitors start a chat on your site, they will appear in the list on the left.
        </p>
      </div>
    </div>
  );
};
