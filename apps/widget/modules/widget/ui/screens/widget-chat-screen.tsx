"use client";

/**
 * WidgetChatScreen (prod-safe, no threads API)
 * - Creates a conversation if needed
 * - Waits for conversation.threadId to be populated, then sends
 * - Booking flow:
 *   1) consent (optionnel)
 *   2) qualif (nom, email, company, role)
 *   3) pick_rep (si plusieurs sales disponibles)
 *   4) picking (slots pour le rep choisi)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useAtomValue, useAtom, useSetAtom } from "jotai";

import {
  conversationIdAtom,
  contactSessionIdAtomFamily,
  organizationIdAtom,
  widgetSettingsAtom,
} from "../../atoms/widget-atoms";
import {
  qualifyDataAtom,
  qualifyStepAtom,
  bookingIntentAtom,
  consentGivenAtom,
  assignedRepAtom,
} from "../../atoms/qualify-atoms";

import { WidgetHeader } from "../components/widget-header";
import { Button } from "@workspace/ui/components/button";
import { CalendarIcon, MenuIcon } from "lucide-react";

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

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import QualifyCard from "../components/QualifyCard";

/* ---------------- helpers ---------------- */

const formSchema = z.object({ message: z.string().min(1) });

type Slot = { start: number; end: number };

// doit matcher le retour de api.public.routing.listRepsForVisitor
type PublicRep = {
  userId: string;
  name?: string;
  avatarUrl?: string;
  role: "sales" | "support";
  regions: string[];
  available: boolean;
};

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
            {list.map((s, i) => (
              <button
                key={`${s.start}-${s.end}-${i}`}
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

function ConsentInlineModal({
  triggerLabel,
  title,
  fullText,
}: {
  triggerLabel: string;
  title: string;
  fullText: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="underline">{triggerLabel}</button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="whitespace-pre-wrap text-sm text-muted-foreground">
          {fullText}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Petit composant pour choisir un sales quand il y en a plusieurs.
 */
function RepPicker({
  reps,
  onPick,
}: {
  reps: PublicRep[];
  onPick: (rep: PublicRep) => void;
}) {
  if (!reps.length) return null;

  return (
    <div className="p-3">
      <div className="mb-2 text-sm text-muted-foreground">
        Choose who you want to meet:
      </div>
      <div className="grid grid-cols-1 gap-2">
        {reps.map((rep) => (
          <button
            key={rep.userId}
            onClick={() => onPick(rep)}
            className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-left hover:bg-accent transition"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted overflow-hidden">
              {rep.avatarUrl ? (
                // si tu as un composant Avatar interne, tu peux le remplacer ici
                <img
                  src={rep.avatarUrl}
                  alt={rep.name ?? rep.userId}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <span className="text-xs font-medium">
                  {(rep.name || "S")[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {rep.name || "Sales rep"}
              </span>
              <span className="text-xs text-muted-foreground">
                {rep.regions?.length ? rep.regions.join(", ") : "Global team"}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- screen ---------------- */

export const WidgetChatScreen = () => {
  const widgetSettings = useAtomValue(widgetSettingsAtom);
  const consentCfg = widgetSettings?.consent;
  const organizationId = useAtomValue(organizationIdAtom);
  const contactSessionId = useAtomValue(
    contactSessionIdAtomFamily(organizationId || "")
  );
  const conversationId = useAtomValue(conversationIdAtom);
  const setConversationId = useSetAtom(conversationIdAtom);

  // Qualif + consent
  const [step, setStep] = useAtom(qualifyStepAtom);
  const [qdata, setQdata] = useAtom(qualifyDataAtom);
  const [bookingIntent, setBookingIntent] = useAtom(bookingIntentAtom);
  const [, setConsentGiven] = useAtom(consentGivenAtom);
  const [, setAssignedRep] = useAtom(assignedRepAtom);

  // Reps via routing
  const routingReps = useQuery(
    api.public.routing.listRepsForVisitor,
    organizationId && contactSessionId
      ? { organizationId, contactSessionId }
      : "skip"
  ) as PublicRep[] | undefined;

  const [repChoices, setRepChoices] = useState<PublicRep[]>([]);
  const [selectedRep, setSelectedRep] = useState<PublicRep | null>(null);

  // Conversation + messages
  const conversation = useQuery(
    api.public.conversations.getOne,
    conversationId && contactSessionId
      ? { conversationId, contactSessionId }
      : "skip"
  );

  // Track latest threadId (so polling reads fresh values)
  const threadIdRef = useRef<string | null>(null);
  useEffect(() => {
    threadIdRef.current = conversation?.threadId ?? null;
  }, [conversation?.threadId]);

  // Wait helper: resolve once threadId exists (short poll)
  async function waitForThreadId(opts: { timeoutMs?: number; intervalMs?: number } = {}) {
    const timeoutMs = opts.timeoutMs ?? 4000;
    const intervalMs = opts.intervalMs ?? 150;
    const start = Date.now();

    if (threadIdRef.current) return threadIdRef.current;

    while (Date.now() - start < timeoutMs) {
      if (threadIdRef.current) return threadIdRef.current;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
  }

  const messages = useThreadMessages(
    api.public.messages.getMany,
    conversation?.threadId && contactSessionId
      ? { threadId: conversation.threadId, contactSessionId }
      : "skip",
    { initialNumItems: 10 }
  );

  // local messages + booking
  const [localMsgs, setLocalMsgs] = useState<
    Array<{ role: "assistant" | "user"; text: string }>
  >([]);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // calendar (fallback / compat)
  const calendarAccount = useQuery(
    api.public.calendar.getAccount,
    organizationId ? { organizationId } : "skip"
  );
  const listSlots = useAction(api.public.calendar.listSlots);
  const bookSlot = useAction(api.public.calendar.bookSlot);

  // analytics & conversation bootstrap
  const logEvent = useMutation(api.public.analytics.log);
  const createConversation = useMutation(api.public.conversations.create);
  const firstMessageSentRef = useRef(false);

  const showWelcomeChoices = !conversationId && step === "idle";

  // log widget load
  useEffect(() => {
    if (!organizationId) return;
    logEvent({
      organizationId,
      type: "widget_loaded",
      sessionId: contactSessionId || undefined,
    }).catch(() => {});
  }, [organizationId, contactSessionId, logEvent]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { message: "" },
  });
  const createMessage = useAction(api.public.messages.create);

  /* -------- consent disabled => act immediately -------- */
  useEffect(() => {
    const consentEnabled = consentCfg?.enabled !== false;
    if (consentEnabled) return;

    if (bookingIntent === "book" && step !== "ask_name") {
      setStep("ask_name");
      setLocalMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text: "Great! To book a demo, fill in these quick details.",
        },
      ]);
    }

    if (bookingIntent === "chat") {
      (async () => {
        try {
          if (!conversation && organizationId && contactSessionId) {
            const cid = await createConversation({
              organizationId,
              contactSessionId,
            });
            setConversationId(cid);
          }
        } catch {}
        setStep("idle");
        setBookingIntent("none");
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    consentCfg?.enabled,
    bookingIntent,
    organizationId,
    contactSessionId,
    conversation,
  ]);

  /* -------- helper : charger les slots pour UN rep -------- */
  const loadSlotsForRep = async (rep: PublicRep) => {
    if (!organizationId) return;

    setSelectedRep(rep);
    setAssignedRep({
      userId: rep.userId,
      name: rep.name,
      avatarUrl: rep.avatarUrl,
      regions: rep.regions ?? [],
    });
    setStep("picking");
    setLoadingSlots(true);
    try {
      const s = await listSlots({
        organizationId,
        userId: rep.userId, // 👈 clé : slots spécifiques à ce sales
        days: 7,
        slotMinutes: 30,
      });
      setSlots(s);
    } finally {
      setLoadingSlots(false);
    }
  };

  /* -------- Qualif flow -------- */
  const startPickingAfterQualify = async (lead: {
    name: string;
    email: string;
    company?: string;
    role?: string;
  }) => {
    setQdata(lead);

    // message générique
    setLocalMsgs((m) => [
      ...m,
      {
        role: "assistant",
        text: "Perfect — let’s find the best person for you 👇",
      },
    ]);

    if (!organizationId || !contactSessionId) {
      setStep("done");
      return;
    }

    const reps = (routingReps ?? []) as PublicRep[];

    // 1) Aucun rep dispo selon routing → fallback ancien comportement
    if (!reps.length) {
      if (!calendarAccount) {
        setLocalMsgs((m) => [
          ...m,
          {
            role: "assistant",
            text: "No teammate is available right now. Please try again later.",
          },
        ]);
        setStep("done");
        return;
      }

      // Fallback : un seul calendrier "par défaut"
      setLocalMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text: "Our team will assign the right person. Pick any time below 👇",
        },
      ]);

      setStep("picking");
      setLoadingSlots(true);
      try {
        const s = await listSlots({
          organizationId,
          // on précise quand même le userId du compte calendar principal
          userId: calendarAccount.userId,
          days: 7,
          slotMinutes: 30,
        });
        setSlots(s);
      } finally {
        setLoadingSlots(false);
      }
      return;
    }

    if (reps.length === 1) {
      const onlyRep = reps[0];
      if (onlyRep) {
        await loadSlotsForRep(onlyRep);
      }
      return;
    }

    // 3) Plusieurs reps → étape pick_rep
    setRepChoices(reps);
    setStep("pick_rep");
  };

  /* -------- Send message (thread bootstrap + retry) -------- */
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const text = values.message.trim();
    form.reset();
    if (!text) return;

    if (!firstMessageSentRef.current && organizationId) {
      firstMessageSentRef.current = true;
      logEvent({
        organizationId,
        type: "inbound_chat_requested",
        sessionId: contactSessionId || undefined,
        meta: { source: step === "idle" ? "manual" : "flow" },
      }).catch(() => {});
    }

    // booking intent via free text
    if (step === "idle" && /book|demo|meeting/i.test(text)) {
      setLocalMsgs((m) => [...m, { role: "user", text }]);
      setBookingIntent("book");
      if (consentCfg?.enabled === false) {
        setStep("ask_name");
        setLocalMsgs((m) => [
          ...m,
          {
            role: "assistant",
            text: "Great! To book a demo, fill in these quick details.",
          },
        ]);
      } else {
        setStep("consent");
      }
      return;
    }

    if (!contactSessionId || !organizationId) return;

    // Ensure a conversation exists
    let cid = conversationId;
    try {
      if (!cid || !conversation) {
        cid = await createConversation({ organizationId, contactSessionId });
        setConversationId(cid);
      }
    } catch {
      setLocalMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text: "One sec… ready now. Please resend your message.",
        },
      ]);
      return;
    }

    // Wait for threadId to be ready, then send
    const thr = conversation?.threadId ?? (await waitForThreadId());
    if (!thr) {
      setLocalMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text:
            "Preparing the chat… please resend your message in a moment.",
        },
      ]);
      return;
    }

    try {
      await createMessage({
        threadId: thr,
        prompt: text,
        contactSessionId,
      });
    } catch {
      setLocalMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text: "Network hiccup—please try again.",
        },
      ]);
    }
  };

  /* -------- Messages + greet -------- */
  const backendMsgs = toUIMessages(messages.results ?? []).map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("assistant" as const),
    text: m.content,
  }));

  const greet = widgetSettings?.greetMessage?.trim();
  const hideGreetNow = bookingIntent === "book" || step !== "idle";
  const filteredBackend = greet
    ? backendMsgs.filter((m) => {
        if (!hideGreetNow) return true;
        return !(m.role === "assistant" && m.text.trim() === greet);
      })
    : backendMsgs;

  const uiMsgs = [...filteredBackend, ...localMsgs];

  const suggestions = useMemo(() => {
    const base = widgetSettings
      ? (Object.values(widgetSettings.defaultSuggestions).filter(Boolean) as string[])
      : [];
    return ["Book a demo", ...base];
  }, [widgetSettings]);

  return (
    <>
      <WidgetHeader className="flex items-center justify-between">
        <p className="font-medium">Chat</p>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="transparent"
            onClick={() => {
              setBookingIntent("book");
              if (consentCfg?.enabled === false) {
                setStep("ask_name");
                setLocalMsgs((m) => [
                  ...m,
                  {
                    role: "assistant",
                    text: "Great! To book a demo, fill in these quick details.",
                  },
                ]);
              } else {
                setStep("consent");
              }
            }}
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
                <DicebearAvatar
                  imageUrl="https://app.inboundless.co/logo.svg"
                  seed="assistant"
                  size={32}
                />
              )}
            </AIMessage>
          ))}

          {/* welcome card */}
          {!conversationId && step === "idle" && (
            <div className="p-3">
              <div className="rounded-lg border bg-background p-3">
                <div className="font-semibold text-lg mb-2">
                  Discover the right solution for your business project.
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Our team is available to chat or schedule a quick call to
                  guide you through your needs.
                </p>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={async () => {
                      setBookingIntent("chat");
                      if (consentCfg?.enabled === false) {
                        try {
                          if (!conversation && organizationId && contactSessionId) {
                            const cid2 = await createConversation({
                              organizationId,
                              contactSessionId,
                            });
                            setConversationId(cid2);
                          }
                        } catch {}
                        setStep("idle");
                        setBookingIntent("none");
                      } else {
                        setStep("consent");
                      }
                    }}
                  >
                    💬 Chat with AI Assistant
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setBookingIntent("book");
                      if (consentCfg?.enabled === false) {
                        setStep("ask_name");
                        setLocalMsgs((m) => [
                          ...m,
                          {
                            role: "assistant",
                            text: "Great! To book a demo, fill in these quick details.",
                          },
                        ]);
                      } else {
                        setStep("consent");
                      }
                    }}
                  >
                    📅 Book a meeting
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* consent card */}
          {step === "consent" &&
            consentCfg &&
            consentCfg.enabled !== false && (
              <div className="p-3">
                <div className="mb-2 rounded-lg border bg-background p-3 text-sm">
                  {(consentCfg.title || consentCfg.intro) && (
                    <div className="mb-2">
                      {consentCfg.title && (
                        <div className="font-medium">{consentCfg.title}</div>
                      )}
                      {consentCfg.intro && (
                        <div className="text-muted-foreground">
                          {consentCfg.intro}
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {consentCfg.body ||
                      "Before we begin, you need to provide consent to data processing that may occur in your chat session."}{" "}
                    {(() => {
                      const linkMode = consentCfg.linkMode ?? "link";
                      const consentUrl = consentCfg.privacyUrl;
                      const consentModalText = consentCfg.modalContent;
                      if (linkMode === "link" && consentUrl) {
                        return (
                          <>
                            I hereby consent to processing of my personal data
                            collected in the chat in accordance with the rules
                            described{" "}
                            <a
                              href={consentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              here
                            </a>
                            .
                          </>
                        );
                      }
                      return (
                        <ConsentInlineModal
                          triggerLabel="here"
                          title={consentCfg.title ?? "Consent"}
                          fullText={
                            (consentModalText?.trim() ||
                              consentCfg.body?.trim() ||
                              "Details about how your data may be processed.") +
                            "\n\nYou can withdraw your consent at any time."
                          }
                        />
                      );
                    })()}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      setConsentGiven(true);

                      if (bookingIntent === "book") {
                        setStep("ask_name");
                        setLocalMsgs((m) => [
                          ...m,
                          {
                            role: "assistant",
                            text: "Great! To book a demo, fill in these quick details.",
                          },
                        ]);
                      } else {
                        try {
                          if (!conversation && organizationId && contactSessionId) {
                            const cid2 = await createConversation({
                              organizationId,
                              contactSessionId,
                            });
                            setConversationId(cid2);
                          }
                        } catch {}
                        setStep("idle");
                      }

                      const intent = bookingIntent;
                      setBookingIntent("none");

                      if (organizationId) {
                        const linkMode = consentCfg.linkMode ?? "link";
                        const consentUrl = consentCfg.privacyUrl;
                        logEvent({
                          organizationId,
                          type: "consent_given",
                          sessionId: contactSessionId || undefined,
                          meta: {
                            version: consentCfg.version,
                            privacyUrl: consentUrl,
                            linkMode,
                            intent,
                          },
                        }).catch(() => {});
                      }
                    }}
                  >
                    {consentCfg.acceptLabel?.trim() || "✓ I consent"}
                  </Button>
                </div>
              </div>
            )}

          {/* Qualif form */}
          {step === "ask_name" && bookingIntent !== "chat" && (
            <QualifyCard
              initial={{
                name: qdata.name,
                email: qdata.email,
                company: qdata.company,
                role: qdata.role,
              }}
              onSubmit={(lead) => {
                if (organizationId) {
                  logEvent({
                    organizationId,
                    type: "lead_qualified",
                    sessionId: contactSessionId || undefined,
                    meta: lead,
                  }).catch(() => {});
                }
                startPickingAfterQualify(lead);
                setBookingIntent("none");
              }}
            />
          )}

          {/* Choix du rep (multi-sales) */}
          {step === "pick_rep" && repChoices.length > 0 && (
            <RepPicker
              reps={repChoices}
              onPick={async (rep) => {
                await loadSlotsForRep(rep);
              }}
            />
          )}

          {/* Slot picker */}
          {step === "picking" && (
            <>
              {loadingSlots && (
                <div className="p-3 text-sm text-muted-foreground">
                  Loading times…
                </div>
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
                    )
                      return;

                    const res = await bookSlot({
                      organizationId,
                      userId: selectedRep?.userId, // 👈 réservez bien sur le bon rep
                      contactSessionId,
                      attendeeName: qdata.name,
                      attendeeEmail: qdata.email,
                      attendeeCompany: qdata.company,
                      attendeeRole: qdata.role,
                      start: s.start,
                      end: s.end,
                    });

                    logEvent({
                      organizationId,
                      type: "meeting_booked",
                      sessionId: contactSessionId,
                      meta: {
                        start: s.start,
                        end: s.end,
                        bookingId: res?.bookingId,
                        meetingUrl: res?.meetingUrl,
                        lead: qdata,
                        repUserId: selectedRep?.userId,
                        repName: selectedRep?.name,
                      },
                    }).catch(() => {});

                    setLocalMsgs((m) => [
                      ...m,
                      {
                        role: "assistant",
                        text: res?.meetingUrl
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

      {/* suggestions */}
      {uiMsgs.length <= 1 && step === "idle" && (
        <AISuggestions className="flex w-full flex-col items-end p-2">
          {suggestions.map((s) => (
            <AISuggestion
              key={s}
              suggestion={s}
              onClick={async () => {
                if (/book/i.test(s)) {
                  setBookingIntent("book");
                  if (consentCfg?.enabled === false) {
                    setStep("ask_name");
                    setLocalMsgs((m) => [
                      ...m,
                      {
                        role: "assistant",
                        text: "Great! To book a demo, fill in these quick details.",
                      },
                    ]);
                  } else {
                    setStep("consent");
                  }
                  return;
                }
                form.setValue("message", s, {
                  shouldValidate: true,
                  shouldDirty: true,
                  shouldTouch: true,
                });
                await form.handleSubmit(onSubmit)();
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
                disabled={
                  conversation?.status === "resolved" ||
                  step === "ask_name" ||
                  step === "pick_rep" ||
                  step === "picking"
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
                    ? "This conversation has been resolved."
                    : step === "ask_name"
                    ? "Fill the form above to continue…"
                    : step === "pick_rep"
                    ? "Choose who you want to meet…"
                    : step === "picking"
                    ? "Pick a time above…"
                    : "Type your message..."
                }
                value={field.value}
              />
            )}
          />
          <AIInputToolbar>
            <AIInputTools />
            <AIInputSubmit
              disabled={
                conversation?.status === "resolved" ||
                !form.formState.isValid ||
                step === "ask_name" ||
                step === "pick_rep" ||
                step === "picking"
              }
              status="ready"
              type="submit"
            />
          </AIInputToolbar>
        </AIInput>
      </Form>
    </>
  );
};
