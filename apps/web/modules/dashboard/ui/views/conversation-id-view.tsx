"use client";

import { toUIMessages, useThreadMessages } from "@convex-dev/agent/react"
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { Button } from "@workspace/ui/components/button";
import { useAction, useMutation, useQuery } from "convex/react";
import { MoreHorizontalIcon, Trash2Icon, Wand2Icon } from "lucide-react";
import {
    AIConversation,
    AIConversationContent,
    AIConversationScrollButton,
} from "@workspace/ui/components/ai/conversation"
import {
    AIInput,
    AIInputButton,
    AIInputSubmit,
    AIInputTextarea,
    AIInputToolbar,
    AIInputTools,
} from "@workspace/ui/components/ai/input"
import {
    AIMessage,
    AIMessageContent,
} from "@workspace/ui/components/ai/message"
import { AIResponse } from "@workspace/ui/components/ai/response"
import { Form, FormField } from "@workspace/ui/components/form"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { DicebearAvatar } from "@workspace/ui/components/dicebear-avatar";
import { ConversationStatusButton } from "../components/conversation-status-button";
import { useEffect, useRef, useState } from "react";
import { useInfiniteScroll } from "@workspace/ui/hooks/use-infinite-scroll";
import { InfiniteScrollTrigger } from "@workspace/ui/components/infinite-scroll-trigger";
import { cn } from "@workspace/ui/lib/utils";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { useRouter } from "next/navigation";

const formSchema = z.object({
    message: z.string().min(1, "Message is required"),
})

export const ConversationIdView = ({
    conversationId,
}: {
    conversationId: Id<"conversations">,
}) => {
    const conversation = useQuery(api.private.conversations.getOne, {
        conversationId,
    })
    const markViewed = useMutation(api.private.conversations.markViewed);
    const removeConversation = useMutation(api.private.conversations.remove);
    const router = useRouter();

    useEffect(() => {
        if (conversation?.status === "escalated") {
            markViewed({ conversationId });
        }
    }, [conversation?.status, conversationId, markViewed]);

    const messages = useThreadMessages(
        api.private.messages.getMany,
        conversation?.threadId ? { threadId: conversation.threadId } : "skip",
        { initialNumItems: 10, }
    )

    const {
        topElementRef,
        handleLoadMore,
        canLoadMore,
        isLoadingMore,
    } = useInfiniteScroll({
        status: messages.status,
        loadMore: messages.loadMore,
        loadSize: 10 ,
    })

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            message: "",
        },
    });

    const [isEnhancing, setIsEnhancing] = useState(false);
    const enhanceResponse= useAction(api.private.messages.enhanceResponse);
    const handleEnhanceResponse = async () => {
        setIsEnhancing(true);
        const currentValue = form.getValues("message")

        try {
            const response = await enhanceResponse({ prompt: currentValue});

            form.setValue("message", response);
        } catch (error) {
            toast.error("Something went wrong")
            console.error(error);
        } finally {
            setIsEnhancing(false);
        }
    }

    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const createMessage = useMutation(api.private.messages.create);
    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        try {
            await createMessage({
                conversationId,
                prompt: values.message,
            });

            form.reset();
            requestAnimationFrame(() => inputRef.current?.focus());
        } catch (error) {
            console.error(error)
        }
    }

    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    const updateConversationStatus = useMutation(api.private.conversations.updateStatus);
    const handleToggleStatus = async () => {
        if (!conversation) {
            return;
        }

        setIsUpdatingStatus(true);

        let newStatus: "unresolved" | "resolved" | "escalated";

        if (conversation.status === "unresolved") {
            newStatus = "escalated";
        } else if (conversation.status === "escalated") {
            newStatus = "resolved"
        } else {
            newStatus = "unresolved"
        }

        try {
            await updateConversationStatus ({
                conversationId,
                status: newStatus,
            });
        } catch (error) {
            console.error(error);
        } finally {
            setIsUpdatingStatus(false);
        }
    }

    if (conversation === undefined || messages.status === "LoadingFirstPage") {
        return <ConversationIdViewLoading />
    }



    return (
        <div className="flex h-full flex-col bg-muted/40">
            <header className="flex items-center justify-between border-b bg-background/80 p-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost">
                            <MoreHorizontalIcon />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={async () => {
                                try {
                                    await removeConversation({ conversationId });
                                    toast.success("Conversation deleted");
                                    router.push("/conversations");
                                } catch (e) {
                                    toast.error("Failed to delete");
                                    console.error(e);
                                }
                            }}
                        >
                            <Trash2Icon className="size-4 mr-2" />
                            Delete conversation
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                {!!conversation && (
                    <ConversationStatusButton 
                        onClick={handleToggleStatus}
                        status={conversation?.status}
                        disabled={isUpdatingStatus}
                    />
                )}
            </header>
            <AIConversation className="max-h-[calc(100vh-180px)]">
                <AIConversationContent>
                    <InfiniteScrollTrigger 
                        canLoadMore={canLoadMore}
                        isLoadingMore={isLoadingMore}
                        onLoadMore={handleLoadMore}
                        ref={topElementRef}
                    />
                    {toUIMessages(messages.results ?? [])?.map((message) => (
                        <AIMessage
                            from={message.role === "user" ? "assistant" : "user"}
                            key={message.id}
                        >
                            <AIMessageContent>
                                <AIResponse>
                                    {message.content}
                                </AIResponse>
                            </AIMessageContent>
                            {message.role === "user" && (
                                <DicebearAvatar 
                                    seed={conversation?.contactSessionId ?? "user"}
                                    size={32}
                                />
                            )}
                        </AIMessage>
                    ))}
                </AIConversationContent>
                <AIConversationScrollButton />
            </AIConversation>

            <div className="border-t bg-background/70 p-2 backdrop-blur supports-[backdrop-filter]:bg-background/50">
            <Form {...(form as any)}>
                <AIInput onSubmit={form.handleSubmit(onSubmit)}>
                <FormField
                    control={form.control as any}
                    name="message"
                    render={({ field }) => (
                    <AIInputTextarea
                        ref={inputRef}
                        autoFocus
                        disabled={
                        conversation?.status === "resolved" ||
                        form.formState.isSubmitting ||
                        isEnhancing
                        }
                        onChange={field.onChange}
                        onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            form.handleSubmit(onSubmit)();
                        }
                        }}
                        placeholder={
                        conversation?.status === "resolved"
                            ? "This conversation has been resolved"
                            : "Type your response as an operator..."
                        }
                        value={field.value}
                    />
                    )}
                />
                <AIInputToolbar>
                    <AIInputTools>
                    <AIInputButton
                        onClick={handleEnhanceResponse}
                        disabled={
                        conversation?.status === "resolved" ||
                        isEnhancing ||
                        !form.formState.isValid
                        }
                    >
                        <Wand2Icon />
                        {isEnhancing ? "Enhancing..." : "Enhance"}
                    </AIInputButton>
                    </AIInputTools>
                    <AIInputSubmit
                    disabled={
                        conversation?.status === "resolved" ||
                        !form.formState.isValid ||
                        form.formState.isSubmitting ||
                        isEnhancing
                    }
                    status="ready"
                    type="submit"
                    />
                </AIInputToolbar>
                </AIInput>
            </Form>
            </div>

        </div>
    )
}

export const ConversationIdViewLoading = () => {
    return(
        <div className="flex h-full flex-col bg-muted/40">
            <header className="flex items-center justify-between border-b bg-background/80 p-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <Button disabled size="sm" variant="ghost">
                    <MoreHorizontalIcon />
                </Button>
            </header>
            <AIConversation className="max-h-[calc(100vh-180px)]">
                <AIConversationContent>
                    {Array.from({ length: 8 }, (_, index) => {
                        const isUser = index % 2 ===0;
                        const widths = ["w-48", "w-60", "w-72"];
                        const width = widths[index % widths.length]

                        return (
                            <div
                                className={cn(
                                    "group flex w-full items-end justify-end gap-2 py-2 [&>div]:max-w-[80%]",
                                    isUser ? "is-user" : "is-assistant flex-row-reverse"
                                )}
                                key={index}
                            >
                                <Skeleton className={`h-9 ${width} rounded-lg bg-neutral-200`}/>
                                <Skeleton className="size-8 rounded-full bg-neutral-200"/>

                            </div>
                        )
                    })}
                </AIConversationContent>
            </AIConversation>

            <div className="border-t bg-background/70 p-2 backdrop-blur supports-[backdrop-filter]:bg-background/50">
                <AIInput>
                    <AIInputTextarea 
                        disabled
                        placeholder="Type your response as an operator..."
                    />
                    <AIInputToolbar>
                        <AIInputTools />
                        <AIInputSubmit disabled status="ready"/>
                    </AIInputToolbar>
                </AIInput>
            </div>
        </div>
    )
}