"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useAtomValue, useSetAtom, useAtom } from "jotai";

import {
  conversationIdAtom,
  contactSessionIdAtomFamily,
  organizationIdAtom,
  screenAtom,
  widgetSettingsAtom,
} from "../../atoms/widget-atoms";
import { qualifyDataAtom, qualifyStepAtom } from "../../atoms/qualify-atoms";

import { WidgetHeader } from "../components/widget-header";
import { Button } from "@workspace/ui/components/button";
import { ArrowLeftIcon, CalendarIcon, MenuIcon } from "lucide-react";

import {
  AIConversation,
  AIConversationContent,
} from "@workspace/ui/components/ai/conversation";
import {
  AIInput,
  AIInputSubmit,
  AIInputTextarea,
  AIInputToolbar,
  AIInputTools,
} from "@workspace/ui/components/ai/input";
import { AIMessage, AIMessageContent } from "@workspace/ui/components/ai/message";
import { AIResponse } from "@workspace/ui/components/ai/response";
import { AISuggestion, AISuggestions } from "@workspace/ui/components/ai/suggestion";
import { Form, FormField } from "@workspace/ui/components/form";
import { toUIMessages, useThreadMessages } from "@convex-dev/agent/react";
import { DicebearAvatar } from "@workspace/ui/components/dicebear-avatar";

/* -------------------- helpers -------------------- */

const formSchema = z.object({ message: z.string().min(1) });

type Slot = { start: number; end: number };

function formatDay(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatSlot(ts: number) {
  return new Date(ts).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SlotsByDay({
  slots,
  onPick,
}: {
  slots: Slot[];
  onPick: (s: Slot) => void;
}) {
  if (!slots.length) {
    return (
      <div className="p-3 text-sm text-muted-foreground">
        No availability found. Please try later.
      </div>
    );
  }

  const uniq = Array.from(
    new Map(slots.map((s) => [`${s.start}-${s.end}`, s])).values()
  );

  const grouped = uniq.reduce<Record<string, Slot[]>>((acc, s) => {
    const k = formatDay(s.start);
    (acc[k] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-3 p-3">
      {Object.entries(grouped).map(([day, list]) => (
        <div key={day}>
          <div className="px-1 pb-1 text-xs uppercase tracking-wide text-muted-foreground">
            {day}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {list.map((s) => (
              <button
                key={`${s.start}-${s.end}`}
                className="rounded-lg border px-4 py-3 text-sm shadow-sm hover:shadow transition active:scale-[0.99] bg-background hover:bg-accent"
                onClick={() => onPick(s)}
              >
                {formatSlot(s.start)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------- screen -------------------- */

export const WidgetChatScreen = () => {
  const setScreen = useSetAtom(screenAtom);
  const setConversationId = useSetAtom(conversationIdAtom);

  const widgetSettings = useAtomValue(widgetSettingsAtom);
  const organizationId = useAtomValue(organizationIdAtom);
  const contactSessionId = useAtomValue(
    contactSessionIdAtomFamily(organizationId || "")
  );
  const conversationId = useAtomValue(conversationIdAtom);

  // qualification
  // Étapes: "idle" | "ask_name" | "ask_email" | "ask_company" | "ask_role" | "picking" | "done"
  const [step, setStep] = useAtom(qualifyStepAtom);
  // Données: { name?: string; email?: string; company?: string; role?: string }
  const [qdata, setQdata] = useAtom(qualifyDataAtom);

  // messages backend
  const conversation = useQuery(
    api.public.conversations.getOne,
    conversationId && contactSessionId
      ? { conversationId, contactSessionId }
      : "skip"
  );
  const messages = useThreadMessages(
    api.public.messages.getMany,
    conversation?.threadId && contactSessionId
      ? { threadId: conversation.threadId, contactSessionId }
      : "skip",
    { initialNumItems: 10 }
  );

  // état local pour l’interview + slots
  const [localMsgs, setLocalMsgs] = useState<
    Array<{ role: "assistant" | "user"; text: string }>
  >([]);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // actions calendar
  const calendarAccount = useQuery(
    api.public.calendar.getAccount,
    organizationId ? { organizationId } : "skip"
  );
  const listSlots = useAction(api.public.calendar.listSlots);
  const bookSlot = useAction(api.public.calendar.bookSlot);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { message: "" },
  });
  const createMessage = useAction(api.public.messages.create);

  const startQualify = () => {
    if (step !== "idle") return;
    setLocalMsgs((m) => [
      ...m,
      { role: "assistant", text: "Great! To book a demo, what's your full name?" },
    ]);
    setStep("ask_name");
  };

  const handleQualifyTurn = async (userText: string) => {
    if (step === "ask_name") {
      setQdata((d) => ({ ...d, name: userText.trim() }));
      setLocalMsgs((m) => [
        ...m,
        { role: "user", text: userText },
        { role: "assistant", text: "Thanks! What's your email?" },
      ]);
      setStep("ask_email");
      return true;
    }

    if (step === "ask_email") {
      setQdata((d) => ({ ...d, email: userText.trim() }));
      setLocalMsgs((m) => [
        ...m,
        { role: "user", text: userText },
        { role: "assistant", text: "What's your company?" },
      ]);
      setStep("ask_company");
      return true;
    }

    if (step === "ask_company") {
      setQdata((d) => ({ ...d, company: userText.trim() }));
      setLocalMsgs((m) => [
        ...m,
        { role: "user", text: userText },
        { role: "assistant", text: "And your role / job title?" },
      ]);
      setStep("ask_role");
      return true;
    }

    if (step === "ask_role") {
      setQdata((d) => ({ ...d, role: userText.trim() }));
      setLocalMsgs((m) => [
        ...m,
        { role: "user", text: userText },
        {
          role: "assistant",
          text: calendarAccount
            ? "Perfect — pick a time below 👇"
            : "No calendar is connected yet. Please try again later.",
        },
      ]);

      if (calendarAccount && organizationId) {
        setStep("picking");
        setLoadingSlots(true);
        try {
          const s = await listSlots({
            organizationId,
            days: 7,
            slotMinutes: 30,
          });
          setSlots(s);
        } finally {
          setLoadingSlots(false);
        }
      } else {
        setStep("done");
      }
      return true;
    }

    return false;
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const text = values.message.trim();
    form.reset();

    // déclencheur simple
    if (step === "idle" && /book|demo|meeting/i.test(text)) {
      setLocalMsgs((m) => [...m, { role: "user", text }]);
      startQualify();
      return;
    }

    // interview en cours
    if (
      step === "ask_name" ||
      step === "ask_email" ||
      step === "ask_company" ||
      step === "ask_role"
    ) {
      const consumed = await handleQualifyTurn(text);
      if (consumed) return;
    }

    // flux normal
    if (!conversation || !contactSessionId) return;
    await createMessage({
      threadId: conversation.threadId,
      prompt: text,
      contactSessionId,
    });
  };

  const suggestions = useMemo(() => {
    const base = widgetSettings
      ? (Object.values(widgetSettings.defaultSuggestions).filter(Boolean) as string[])
      : [];
    return ["Book a demo", ...base];
  }, [widgetSettings]);

  const uiMsgs = [
    ...toUIMessages(messages.results ?? []).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      text: m.content,
    })),
    ...localMsgs,
  ];

  const onBack = () => {
    setConversationId(null);
    setScreen("selection");
  };

  return (
    <>
      <WidgetHeader className="flex items-center justify-between">
        <div className="flex items-center gap-x-2">
          <Button onClick={onBack} size="icon" variant="transparent">
            <ArrowLeftIcon />
          </Button>
          <p>Chat</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="transparent"
            onClick={startQualify}
            title="Book a demo"
          >
            <CalendarIcon />
          </Button>
          <Button size="icon" variant="transparent">
            <MenuIcon />
          </Button>
        </div>
      </WidgetHeader>

      <AIConversation>
        <AIConversationContent>
          {uiMsgs.map((m, i) => (
            <AIMessage key={i} from={m.role === "user" ? "user" : "assistant"}>
              <AIMessageContent>
                <AIResponse>{m.text}</AIResponse>
              </AIMessageContent>
              {m.role === "assistant" && (
                <DicebearAvatar imageUrl="/logo.svg" seed="assistant" size={32} />
              )}
            </AIMessage>
          ))}

          {/* Slot picker inline après la qualif */}
          {step === "picking" && (
            <>
              {loadingSlots && (
                <div className="p-3 text-sm text-muted-foreground">Loading times…</div>
              )}
              {!loadingSlots && slots && (
                <SlotsByDay
                  slots={slots}
                  onPick={async (s) => {
                    if (
                      !organizationId ||
                      !contactSessionId ||
                      !qdata.name ||
                      !qdata.email
                    ) return;

                    const res = await bookSlot({
                      organizationId,
                      contactSessionId,
                      attendeeName: qdata.name,
                      attendeeEmail: qdata.email,
                      attendeeCompany: qdata.company, // ✅
                      attendeeRole: qdata.role,       // ✅
                      start: s.start,
                      end: s.end,
                    });

                    setLocalMsgs((m) => [
                      ...m,
                      {
                        role: "assistant",
                        text:
                          res?.meetingUrl
                            ? `You're booked! Join with this link: ${res.meetingUrl}`
                            : "You're booked! Check your inbox for the invite.",
                      },
                    ]);
                    setSlots(null);
                    setStep("done");
                  }}
                />
              )}
            </>
          )}
        </AIConversationContent>
      </AIConversation>

      {/* suggestions (incl. Book a demo) */}
      {uiMsgs.length <= 1 && (
        <AISuggestions className="flex w-full flex-col items-end p-2">
          {suggestions.map((s) => (
            <AISuggestion
              key={s}
              suggestion={s}
              onClick={() => {
                if (/book/i.test(s)) {
                  startQualify();
                  return;
                }
                form.setValue("message", s, {
                  shouldValidate: true,
                  shouldDirty: true,
                  shouldTouch: true,
                });
                form.handleSubmit(onSubmit)();
              }}
            />
          ))}
        </AISuggestions>
      )}

      {/* composer */}
      <Form {...form}>
        <AIInput
          className="rounded-none border-x-0 border-b-0"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <AIInputTextarea
                disabled={conversation?.status === "resolved"}
                onChange={field.onChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    form.handleSubmit(onSubmit)();
                  }
                }}
                placeholder={
                  conversation?.status === "resolved"
                    ? "This conversation has been resolved."
                    : step === "ask_name"
                    ? "Type your full name…"
                    : step === "ask_email"
                    ? "Type your email…"
                    : step === "ask_company"
                    ? "Type your company…"
                    : step === "ask_role"
                    ? "Type your role / job title…"
                    : "Type your message..."
                }
                value={field.value}
              />
            )}
          />
          <AIInputToolbar>
            <AIInputTools />
            <AIInputSubmit
              disabled={conversation?.status === "resolved" || !form.formState.isValid}
              status="ready"
              type="submit"
            />
          </AIInputToolbar>
        </AIInput>
      </Form>
    </>
  );
};
