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
  contactSessionIdAtom,
  organizationIdAtom,
  widgetSettingsAtom,
  screenAtom,
} from "../../atoms/widget-atoms";
import {
  qualifyDataAtom,
  qualifyStepAtom,
  bookingIntentAtom,
  consentGivenAtom,
  assignedRepAtom,
} from "../../atoms/qualify-atoms";

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
import { cn } from "@workspace/ui/lib/utils";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import QualifyCard from "../components/QualifyCard";
import CalendarContainerBeautified from "../components/CalendarContainerBeautified";
import VoiceCallButton from "../components/VoiceCallButton";
/* ---------------- helpers ---------------- */

const formSchema = z.object({ message: z.string().min(1) });
const HUMAN_FALLBACK_SECONDS = 45; // délai avant fallback booking (laisse plus de temps à l'humain)


type Slot = { start: number; end: number };

// doit matcher le retour de api.public.routing.listRepsForVisitor
export type PublicRep = {
  userId: string;
  name?: string;
  avatarUrl?: string;
  role: "sales" | "support";
  regions: string[];
  available: boolean;
  title?: string; // NEW
};

function formatDay(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
function formatSlotTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SlotsByDay({
  slots,
  onPick,
}: {
  slots: Slot[];
  onPick: (s: Slot) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  if (!slots.length) {
    return (
      <div className="p-3 text-sm text-muted-foreground">
        No availability found. Please try later.
      </div>
    );
  }

  // ✔ Dédupe safe
  const uniq: Slot[] = Array.from(
    new Map(slots.map((s: Slot) => [`${s.start}-${s.end}`, s])).values()
  );

  // ✔ Group by formatted day
  const grouped: Record<string, Slot[]> = uniq.reduce(
    (acc: Record<string, Slot[]>, s: Slot) => {
      const k = formatDay(s.start);
      if (!acc[k]) acc[k] = [];
      acc[k].push(s);
      return acc;
    },
    {}
  );

  const dayOrder: string[] = Object.keys(grouped);

  if (dayOrder.length === 0) {
    return (
      <div className="p-3 text-sm text-muted-foreground">
        No availability found.
      </div>
    );
  }

  // ✔ Plus d'undefined ici !
  const safeIndex = Math.min(activeIndex, dayOrder.length - 1);
  const currentDayKey: string = dayOrder[safeIndex] ?? "";
  const currentSlots: Slot[] = grouped[currentDayKey] ?? [];

  return (
    <div className="space-y-3 p-3">
      {/* ---------- Bandeau de jours ---------- */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {dayOrder.map((day: string, idx: number) => {
          const isActive = idx === safeIndex;
          const [weekday, ...rest] = day.split(" ");
          return (
            <button
              key={day}
              type="button"
              onClick={() => setActiveIndex(idx)}
              className={[
                "min-w-[96px] rounded-xl border px-3 py-2 text-left text-xs font-medium transition flex flex-col justify-center",
                isActive ? "shadow-sm" : "bg-background text-foreground",
              ].join(" ")}
              style={
                isActive
                  ? { backgroundColor: "var(--widget-primary)", color: "var(--widget-primary-text)", borderColor: "var(--widget-primary)" }
                  : { borderColor: "color-mix(in srgb, var(--widget-primary) 20%, transparent)" }
              }
            >
              <span className="uppercase tracking-wide">{weekday}</span>
              <span className="text-sm font-semibold">{rest.join(" ")}</span>
            </button>
          );
        })}
      </div>

      {/* ---------- Créneaux ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {currentSlots.map((s: Slot, i: number) => (
          <button
            key={`${s.start}-${s.end}-${i}`}
            type="button"
            className="rounded-xl border px-3 py-2 text-sm shadow-sm transition active:scale-[0.99] bg-background"
            style={{ borderColor: "color-mix(in srgb, var(--widget-primary) 25%, transparent)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--widget-primary)";
              e.currentTarget.style.color = "var(--widget-primary-text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "";
              e.currentTarget.style.color = "";
            }}
            onClick={() => onPick(s)}
          >
            <div className="font-medium">
              {formatSlotTime(s.start)} – {formatSlotTime(s.end)}
            </div>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Times shown in your local timezone.
      </p>
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
        <div className="whitespace-pre-wrap text-sm text-muted-foreground max-h-[60vh] overflow-y-auto pr-2">
          {fullText}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Choix d’un sales quand il y en a plusieurs.
 * 👉 On affiche en priorité le prénom (ou le nom complet),
 * puis le job title + la région en sous-titre.
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
        {reps.map((rep) => {
          const primary = rep.name || rep.title || "Your expert";

          const subtitleParts: string[] = [];

          if (rep.title && rep.title !== primary) {
            subtitleParts.push(rep.title);
          }
          if (rep.regions?.length) {
            subtitleParts.push(rep.regions.join(", "));
          }

          const subtitle = subtitleParts.join(" • ") || "Sales team";

          return (
            <button
              key={rep.userId}
              onClick={() => onPick(rep)}
              className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2 text-left transition"
              style={{ borderColor: "color-mix(in srgb, var(--widget-primary) 25%, transparent)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--widget-primary) 10%, transparent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "";
              }}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted overflow-hidden">
                {rep.avatarUrl ? (
                  <img
                    src={rep.avatarUrl}
                    alt={rep.name ?? rep.userId}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-medium">
                    {(rep.name || rep.title || "S")[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{primary}</span>
                <span className="text-xs text-muted-foreground">{subtitle}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}


/* -------------------------------------------------------------------------- */
/*           NEW LAYOUT : SIDEBAR SALES (LEFT) + CALENDAR (RIGHT)             */
/* -------------------------------------------------------------------------- */

function BookingSplitLayout({
  rep,
  slots,
  loading,
  onPick,
  onBack,
}: {
  rep: PublicRep | null;
  slots: Slot[] | null;
  loading: boolean;
  onPick: (s: Slot) => void;
  onBack: () => void;
}) {
  if (!rep) return null;

  return (
    <div className="flex w-full h-full flex-col bg-white sm:flex-row">
      {/* LEFT SIDEBAR */}
      <div className="flex w-full flex-col items-center border-r p-5 text-center sm:w-1/3" style={{ borderColor: "color-mix(in srgb, var(--widget-primary) 20%, transparent)", backgroundColor: "color-mix(in srgb, var(--widget-primary) 8%, transparent)" }}>
        <div className="mb-3 flex h-14 w-14 overflow-hidden rounded-full border-2 bg-white shadow-sm" style={{ borderColor: "color-mix(in srgb, var(--widget-primary) 40%, transparent)" }}>
          {rep.avatarUrl ? (
            <img src={rep.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-semibold" style={{ color: "var(--widget-primary)" }}>
              {(rep.name || rep.title || "S")[0]?.toUpperCase()}
            </span>
          )}
        </div>
        <h3 className="text-base font-semibold text-foreground">{rep.name || "Your expert"}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {[rep.title, rep.regions?.join(", ")].filter(Boolean).join(" • ") || "Sales team"}
        </p>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Your timezone: {new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).format(new Date())}
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-4 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium transition"
            style={{ borderColor: "color-mix(in srgb, var(--widget-primary) 40%, transparent)", color: "var(--widget-primary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--widget-primary) 12%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "";
            }}
          >
            ← Change rep
          </button>
        )}
      </div>

      {/* RIGHT: CALENDAR */}
      <div className="flex-1 p-4">
        <CalendarContainerBeautified slots={slots} loading={loading} onPick={onPick} />
      </div>
    </div>
  );
}

/* ---------------- screen ---------------- */

export const WidgetChatScreen = () => {
  const widgetSettings = useAtomValue(widgetSettingsAtom);
  const routingMode =
    ((widgetSettings as any)?.routingMode as "auto_assign" | "visitor_choice" | undefined) ??
    "auto_assign";
  const themePrimary =
    (widgetSettings as any)?.theme?.primaryColor ??
    (widgetSettings as any)?.branding?.primaryColor ??
    "#111827";

  const themePrimaryText =
    (widgetSettings as any)?.theme?.primaryTextColor ??
    (widgetSettings as any)?.branding?.primaryTextColor ??
    "#ffffff";

  const chatBubbleColor =
    (widgetSettings as any)?.theme?.chatBubbleColor ??
    (widgetSettings as any)?.branding?.chatBubbleColor ??
    "#a954ab";

  const chatBubbleTextColor =
    (widgetSettings as any)?.theme?.chatBubbleTextColor ??
    (widgetSettings as any)?.branding?.chatBubbleTextColor ??
    "#ffffff";
    
  const consentCfg = widgetSettings?.consent;
  const embedLayout = (widgetSettings as any)?.embedLayout ?? "compact";
  const isFullWidth = embedLayout === "full_width_bottom";
  const organizationId = useAtomValue(organizationIdAtom);
  const contactSessionId = useAtomValue(contactSessionIdAtom);
  const conversationId = useAtomValue(conversationIdAtom);
  const setConversationId = useSetAtom(conversationIdAtom);
  const setScreen = useSetAtom(screenAtom);

  // Qualif + consent
  const [step, setStep] = useAtom(qualifyStepAtom);
  const [qdata, setQdata] = useAtom(qualifyDataAtom);
  const [bookingIntent, setBookingIntent] = useAtom(bookingIntentAtom);
  const [consentGiven, setConsentGiven] = useAtom(consentGivenAtom);
  const [, setAssignedRep] = useAtom(assignedRepAtom);

  const consentEnabled = !!consentCfg && consentCfg.enabled !== false;
  // Soft consent: no longer blocks typing, only shown as notice
  const mustAcceptConsent = false;

  const ensureContactSession = useMutation(api.public.contactSessions.ensure);
  // plan public (no auth) pour gating voice

  const publicPlan = useQuery(
    api.public.entitlements.getPublicPlan,
    organizationId ? { organizationId } : "skip"
  );

  const canUseVoice = !!publicPlan?.canUseVoice;
  // ✅ Only query reps when visitor_choice is actually enabled (prevents false empty array + wrong flow)
  const routingReps = useQuery(
    api.public.routing.listRepsForVisitor,
    routingMode === "visitor_choice" && organizationId && contactSessionId
      ? { organizationId, contactSessionId }
      : "skip"
  ) as PublicRep[] | undefined;

  const [repChoices, setRepChoices] = useState<PublicRep[]>([]);
  const [selectedRep, setSelectedRep] = useState<PublicRep | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [localThreadId, setLocalThreadId] = useState<string | null>(null);

  useEffect(() => {
    if (routingMode === "visitor_choice") {
      setRepChoices(routingReps ?? []);
    }
  }, [routingReps, routingMode]);

  const routingReady = routingMode === "auto_assign" || routingMode === "visitor_choice";
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
    threadIdRef.current = conversation?.threadId ?? localThreadId ?? null;
  }, [conversation?.threadId, localThreadId]);

  const brandLogoUrl =
  (widgetSettings as any)?.brandLogoUrl ??
  "https://app.inboundless.co/logo.svg";

  // Wait helper: resolve once threadId exists (short poll)
  async function waitForThreadId(opts: {
    timeoutMs?: number;
    intervalMs?: number;
  } = {}) {
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

  const effectiveThreadId = conversation?.threadId ?? localThreadId;

  const messages = useThreadMessages(
    api.public.messages.getMany,
    effectiveThreadId && contactSessionId
      ? { threadId: effectiveThreadId, contactSessionId }
      : "skip",
    { initialNumItems: 10 }
  );

  const hasRepStarted = useQuery(
    api.public.analytics.hasInboundRepStarted,
    organizationId && conversationId
      ? { organizationId, conversationId }
      : "skip"
  ) as boolean | undefined;

  const logEvent = useMutation(api.public.analytics.log);
  const createConversation = useMutation(api.public.conversations.create);

  const fallbackTimerRef = useRef<any>(null);
  const fallbackShownRef = useRef(false);

  // refs pour garder l'état "live" pour le timer (évite d'afficher le fallback si l'humain répond entre-temps)
  const conversationStatusRef = useRef<string | null>(null);
  const hasRepStartedRef = useRef<boolean>(false);
  const stepRef = useRef(step);

  useEffect(() => {
    conversationStatusRef.current = conversation?.status ?? null;
  }, [conversation?.status]);

  useEffect(() => {
    if (typeof hasRepStarted === "boolean") {
      hasRepStartedRef.current = hasRepStarted;
    }
  }, [hasRepStarted]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const bookingProposedLoggedRef = useRef(false);

  useEffect(() => {
    // reset if no conversation
    if (!conversationId) {
      fallbackShownRef.current = false;
      bookingProposedLoggedRef.current = false; 
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      return;
    }
    const isEscalated = conversation?.status === "escalated"; // adapte si autre valeur
    if (!isEscalated) {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      fallbackShownRef.current = false;
      bookingProposedLoggedRef.current = false; 
      return;
    }

    const isResolved = conversation?.status === "resolved";
    const humanAlreadyReplied = hasRepStarted === true;

    // stop fallback if resolved OR human replied OR not idle
    if (isResolved || humanAlreadyReplied || step !== "idle") {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      fallbackShownRef.current = false;
      return;
    }

    // already shown => don't spam
    if (fallbackShownRef.current) return;

    // arm timer
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);

    fallbackTimerRef.current = setTimeout(() => {
      // re-vérifier l'état "live" au moment où le timer se déclenche
      const statusNow = conversationStatusRef.current;
      const humanNow = hasRepStartedRef.current;
      const stepNow = stepRef.current;

      if (fallbackShownRef.current) return;

      // si entre-temps la conv est résolue, ou un humain a répondu, ou on n'est plus idle -> ne rien faire
      if (statusNow === "resolved" || humanNow === true || stepNow !== "idle") {
        return;
      }

      fallbackShownRef.current = true;

      // ✅ NEW: log booking_proposed once
      if (!bookingProposedLoggedRef.current && organizationId && conversationId) {
        bookingProposedLoggedRef.current = true;

        logEvent({
          organizationId,
          type: "booking_proposed",
          sessionId: contactSessionId || undefined,
          conversationId,
          meta: {
            reason: "rep_timeout",
            timeoutSeconds: HUMAN_FALLBACK_SECONDS,
            status: statusNow,
          },
        }).catch(() => {});
      }

      setLocalMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text:
            `⏳ If no teammate answers right away, you can book a quick meeting instead.\n` +
            `Click “Book a meeting” to pick a slot.`,
        },
      ]);
    }, HUMAN_FALLBACK_SECONDS * 1000);

    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, [conversationId, conversation?.status, hasRepStarted, step, organizationId, contactSessionId, logEvent]);



  // local messages + booking
  const [localMsgs, setLocalMsgs] = useState<
    Array<{ role: "assistant" | "user"; text: string }>
  >([]);

  // --- pending assistant (prevents "silent" UX + fixes "needs 2nd message" perception)
  const [isPendingAssistant, setIsPendingAssistant] = useState(false);
  const assistantCountAtSendRef = useRef(0);
  const pendingTimeoutRef = useRef<any>(null);
  useEffect(() => {
    if (step !== "idle") {
      setIsPendingAssistant(false);
      if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
    }
  }, [step]);
  const pendingFallbackShownRef = useRef(false);






  // calendar (fallback / compat)
  const calendarAccount = useQuery(
    api.public.calendar.getAccount,
    organizationId ? { organizationId } : "skip"
  );
  const listSlots = useAction(api.public.calendar.listSlots);
  type PickBestSlotsResult = { rep: PublicRep | null; slots: Slot[] };

  type PickBestSlotsArgs = {
    organizationId: string;
    contactSessionId?: any; // ou Id<"contactSessions"> si tu l’importes
    days: number;
    slotMinutes?: number;
  };

  const pickBestRepAndListSlots =
    useAction(api.public.calendar.pickBestRepAndListSlots) as (
      args: PickBestSlotsArgs
    ) => Promise<PickBestSlotsResult>;

  const loadSlotsForRep = async (rep: PublicRep) => {
    if (!organizationId || !contactSessionId) return;



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
        userId: rep.userId,
        days: 21,
        contactSessionId: contactSessionId ?? undefined,
      });
      setSlots(s); // Mettre à jour les créneaux
    } finally {
      setLoadingSlots(false);
    }
  };



  const handleRepPick = (rep: PublicRep) => {
    loadSlotsForRep(rep);
  };

  const bookSlot = useAction(api.public.calendar.bookSlot);

  // analytics & conversation bootstrap

  const firstMessageSentRef = useRef(false);
  const isSendingRef = useRef(false);

  // ✅ NEW: book handler identique à SmartPromo.ensureAndStart("book")
  const startBookingLikePromo = async () => {
    if (!organizationId) return;

    setBookingIntent("book");

    // Soft consent: jump directly into booking details
    setStep("ask_name" as any);


    // on reste sur chat UI
    setScreen("chat");

    // assurer la session si jamais elle manque (rare)
    let sessionId = contactSessionId as any;
    try {
      if (!sessionId) {
        sessionId = (await ensureContactSession({ organizationId })) as any;
      }
    } catch {
      return;
    }

    // réutiliser la conversation si déjà là
    if (conversationId) return;

    // sinon créer une conversation (suppressGreet pour booking)
    try {
      const res = await createConversation({
        contactSessionId: sessionId,
        organizationId,
        suppressGreet: true,
      } as any);

      setConversationId(res.conversationId);
      setLocalThreadId(res.threadId);

    } catch {
      // safe: le chat screen pourra en recréer plus tard si nécessaire
    }
  };
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
            const res = await createConversation({
              organizationId,
              contactSessionId,
            });

            // ✅ createConversation retourne { conversationId, threadId }
            setConversationId(res.conversationId);

            // (optionnel mais recommandé si tu utilises localThreadId)
            setLocalThreadId(res.threadId);
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


  /* -------- Qualif flow -------- */
  const startPickingAfterQualify = async (lead: {
    name: string;
    email: string;
    company?: string;
    role?: string;
    phone?: string;
    description: string;
  }) => {
    setQdata(lead);

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
    if (!routingReady) {
      setLocalMsgs((m) => [
        ...m,
        { role: "assistant", text: "One sec — loading availability…" },
      ]);
      return;
    }
    const reps = routingMode === "visitor_choice" ? ((routingReps ?? []) as PublicRep[]) : [];


    // aucun rep → fallback "ancien comportement"
    if (routingMode === "visitor_choice" && !reps.length) {
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

      setLocalMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text: "Our team will assign the right person. Pick any time below 👇",
        },
      ]);

      setStep("done");
      setLoadingSlots(true);
      try {
        const s = await listSlots({
          organizationId,
          userId: calendarAccount.userId,
          days: 21,
          contactSessionId: contactSessionId ?? undefined,
        });
        setSlots(s);
      } finally {
        setLoadingSlots(false);
      }
      return;
    }

    // ✅ visitor_choice
    if (routingMode === "visitor_choice") {
      setSelectedRep(null);
      setSlots(null);


      setRepChoices(reps);
      setStep("pick_rep");
      return;
    }

    // ✅ auto_assign
    // Important: pickedRep peut être undefined (loading). On attend via useEffect.
    setLocalMsgs((m) => [
      ...m,
      { role: "assistant", text: "Perfect — finding the best available time for you 👇" },
    ]);

    setStep("auto_assign_wait");
    setLoadingSlots(true);

    try {
      const res = await pickBestRepAndListSlots({
        organizationId,
        contactSessionId,
        days: 21,
      });

      if (res?.rep && res?.slots?.length) {
        // ✅ on a rep + slots
        setSelectedRep(res.rep);
        setAssignedRep({
          userId: res.rep.userId,
          name: res.rep.name,
          avatarUrl: res.rep.avatarUrl,
          regions: res.rep.regions ?? [],
        });

        setSlots(res.slots);
        setStep("picking");
        return;
      }

      // aucun rep dispo
      setLocalMsgs((m) => [
        ...m,
        { role: "assistant", text: "No availability found right now. Please try again later." },
      ]);
      setStep("done");
    } finally {
      setLoadingSlots(false);
    }
    return;

  };


  /* -------- Send message (thread bootstrap + retry) -------- */
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    try {
      const text = values.message.trim();
      if (!text) return;

      if (mustAcceptConsent) {
        setStep("consent");
        setBookingIntent("chat");
        return;
      }

      form.reset();

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

        if (!consentEnabled || consentGiven) {
          setStep("ask_name");
          setLocalMsgs((m) => [
            ...m,
            { role: "assistant", text: "Great! To book a demo, fill in these quick details." },
          ]);
        } else {
          setStep("consent");
        }
        return;
      }

      if (!contactSessionId || !organizationId) return;

      // Ensure a conversation exists
      let cid = conversationId;
      let createdThreadId: string | null = null;

      try {
        if (!cid || !conversation) {
          const res = await createConversation({ organizationId, contactSessionId } as any);
          cid = res.conversationId;
          createdThreadId = res.threadId;

          setConversationId(res.conversationId);
          setLocalThreadId(res.threadId);
        }
      } catch {
        setLocalMsgs((m) => [
          ...m,
          { role: "assistant", text: "One sec… ready now. Please resend your message." },
        ]);
        return;
      }

      const thr =
        conversation?.threadId ??
        createdThreadId ??
        localThreadId ??
        (await waitForThreadId());

      if (!thr) {
        setLocalMsgs((m) => [
          ...m,
          { role: "assistant", text: "Preparing the chat… please resend your message in a moment." },
        ]);
        return;
      }

      pendingFallbackShownRef.current = false;

      // pending UI (typing)
      assistantCountAtSendRef.current = backendAssistantCount;
      setIsPendingAssistant(true);

      if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = setTimeout(() => {
        // Si une réponse assistant est arrivée => stop
        if (backendAssistantCountRef.current > assistantCountAtSendRef.current) {
          setIsPendingAssistant(false);
          return;
        }

        // Sinon: on affiche le message 1 seule fois, MAIS on garde Typing… (isPendingAssistant reste true)
        if (pendingFallbackShownRef.current) return;
        pendingFallbackShownRef.current = true;

        setLocalMsgs((m) => [
          ...m,
          {
            role: "assistant",
            text:
              "Still working on it… I’m generating the answer and I’ll post it here as soon as it’s ready.\n\nIf you prefer, you can also ask to speak with a human.",
          },
        ]);

        // Après le message de fallback, on réactive l'input
        setIsPendingAssistant(false);
        if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
      }, 30000);


      try {
        await createMessage({
          threadId: thr,
          prompt: text,
          contactSessionId,
        });
      } catch {
        setIsPendingAssistant(false);
        if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
        setLocalMsgs((m) => [...m, { role: "assistant", text: "Network hiccup—please try again." }]);
      }
    } finally {
      isSendingRef.current = false;
    }
  };


  /* -------- MESSAGES + GREET -------- */
  const backendMsgs = toUIMessages(messages.results ?? [])
    .filter((m) => (m.content ?? "").trim().length > 0)
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      text: m.content,
    }));

  const backendAssistantCount = backendMsgs.filter((m) => m.role === "assistant").length;

  const backendAssistantCountRef = useRef(0);
  useEffect(() => {
    backendAssistantCountRef.current = backendAssistantCount;
  }, [backendAssistantCount]);

  useEffect(() => {
    if (!isPendingAssistant) return;
    if (backendAssistantCount > assistantCountAtSendRef.current) {
      setIsPendingAssistant(false);
      pendingFallbackShownRef.current = false;
      if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
    }
  }, [backendAssistantCount, isPendingAssistant]);

  const greet = widgetSettings?.greetMessage?.trim();

  const filteredBackend = greet
    ? backendMsgs.filter((m) => m.text.trim() !== greet)
    : backendMsgs;

  const baseMsgs = [...filteredBackend, ...localMsgs];

  let uiMsgs = baseMsgs;

  // Always show greet as first message when present and no actual messages yet
  if (greet && uiMsgs.length === 0) {
    uiMsgs = [{ role: "assistant" as const, text: greet }];
  }


  const suggestions = useMemo(() => {
    const base = widgetSettings?.defaultSuggestions
      ? (Object.values(widgetSettings.defaultSuggestions).filter(Boolean) as string[])
      : [];
    return Array.from(new Set(base.map(s => s.trim()))).filter(Boolean);
  }, [widgetSettings]);


  return (
    <div
      style={
        {
          ["--nexus-user-bg" as any]: themePrimary,
          ["--nexus-user-fg" as any]: themePrimaryText,
          ["--nexus-send-bg" as any]: chatBubbleColor,
          ["--nexus-send-fg" as any]: chatBubbleTextColor,
        } as React.CSSProperties
      }
      className="h-full w-full flex flex-col bg-white relative"
    >
      {/* Boutons flottants (mêmes pour tous les layouts) */}
      {typeof window !== "undefined" && window !== window.parent && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          <button
            type="button"
            onClick={startBookingLikePromo}
            title="Book a meeting"
            className="size-9 flex items-center justify-center rounded-full shadow-md transition-all hover:scale-105"
            style={{ backgroundColor: "var(--widget-primary)", color: "var(--widget-primary-text)" }}
          >
            <CalendarIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => window.parent?.postMessage({ type: "close" }, "*")}
            title="Close"
            className="size-9 flex items-center justify-center rounded-full bg-muted shadow-md transition-all hover:scale-105 hover:bg-muted/80"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {isFullWidth && canUseVoice && (
        <div className="absolute top-3 left-3 z-10">
          <VoiceCallButton />
        </div>
      )}

      <div className="flex-1 min-h-0"> 
        <AIConversation className="h-full flex flex-col">
          <AIConversationContent
            className={cn(
              "flex-1 min-h-0 overflow-y-auto",
              isFullWidth && "pt-12 px-3"
            )}
          >
            {uiMsgs.map((m, i) => {
              const isUser = m.role === "user";

              return (
                <AIMessage key={i} from={isUser ? "user" : "assistant"}>
                  <AIMessageContent
                    style={
                      isUser
                        ? { backgroundColor: themePrimary, color: themePrimaryText, borderColor: "transparent" }
                        : undefined
                    }
                  >
                    <AIResponse>{m.text}</AIResponse>
                  </AIMessageContent>

                  {m.role === "assistant" && (
                    <DicebearAvatar imageUrl={brandLogoUrl} seed="assistant" size={32} />
                  )}
                </AIMessage>
              );
            })}


            {conversationId &&
              conversation?.status === "escalated" &&
              hasRepStarted !== true &&
              fallbackShownRef.current &&
              step === "idle" && (
                <div className="p-3">
                  <Button className="w-full" onClick={startBookingLikePromo}>
                    Book a meeting
                  </Button>
                </div>
              )}




              {step === "auto_assign_wait" && (
                <div className="p-3 text-sm text-muted-foreground">
                  Assigning the best rep…
                </div>
              )}


            {/* consent card */}
            {step === "consent" && mustAcceptConsent && consentCfg && consentCfg.enabled !== false && (
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
                        try {
                          const next = sessionStorage.getItem("nexus:after-consent");
                          if (next === "voice") {
                            sessionStorage.removeItem("nexus:after-consent");

                            // reset flow
                            setBookingIntent("none");
                            setStep("idle" as any);

                            // go voice
                            setScreen("voice");
                            return;
                          }
                        } catch {}
                        if (bookingIntent === "book") {
                          setStep("ask_name");
                          setLocalMsgs((m) => [
                            ...m,
                            {
                              role: "assistant",
                              text:
                                "Great! To book a demo, fill in these quick details.",
                            },
                          ]);
                        } else {
                          try {
                            if (
                              !conversation &&
                              organizationId &&
                              contactSessionId
                            ) {
                              const res = await createConversation({
                                organizationId,
                                contactSessionId,
                              } as any);

                              setConversationId(res.conversationId);
                              setLocalThreadId(res.threadId);
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
                  phone: (qdata as any).phone,
                  company: qdata.company,
                  role: qdata.role,
                  description: (qdata as any).description,
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
                onPick={handleRepPick}  // Passer la fonction handleRepPick comme prop onPick
              />
            )}


            {/* NEW picking flow : Sidebar rep + Calendar à droite */}
            {step === "picking" && selectedRep && (
              <BookingSplitLayout
                rep={selectedRep}
                slots={slots}
                loading={loadingSlots}
                onPick={async (slot) => {
                  if (!organizationId || !contactSessionId || !qdata.name || !qdata.email) return;

                  const res = await bookSlot({
                    organizationId,
                    userId: selectedRep?.userId,
                    contactSessionId,
                    attendeeName: qdata.name,
                    attendeeEmail: qdata.email,
                    attendeePhone: (qdata as any).phone,
                    attendeeCompany: qdata.company,
                    attendeeRole: qdata.role,
                    attendeeDescription: (qdata as any).description,
                    start: slot.start,
                    end: slot.end,
                  });

                  setLocalMsgs((m) => [
                    ...m,
                    {
                      role: "assistant",
                      text: `✅ You’re booked with ${selectedRep?.name || 'our team'}\n` +
                            `Join with this link: ${res?.meetingUrl || 'Check your inbox for the invite.'}`,
                    },
                  ]);

                  setSlots(null);  // Réinitialiser les créneaux après la réservation
                  setStep("done");  // Passer à l'étape finale
                }}
                onBack={async () => {
                  if (routingMode === "visitor_choice") {
                    setStep("pick_rep");
                    return;
                  }

                  // auto_assign => relancer l'assign
                  setSelectedRep(null);
                  setSlots(null);
                  setStep("auto_assign_wait");
                  setLoadingSlots(true);

                  try {
                    const res = await pickBestRepAndListSlots({
                      organizationId: organizationId!,
                      contactSessionId,
                      days: 21,
                    });

                    if (res?.rep && res?.slots?.length) {
                      setSelectedRep(res.rep);
                      setAssignedRep({
                        userId: res.rep.userId,
                        name: res.rep.name,
                        avatarUrl: res.rep.avatarUrl,
                        regions: res.rep.regions ?? [],
                      });
                      setSlots(res.slots);
                      setStep("picking");
                      return;
                    }

                    setLocalMsgs((m) => [
                      ...m,
                      { role: "assistant", text: "No availability found right now. Please try again later." },
                    ]);
                    setStep("done");
                  } finally {
                    setLoadingSlots(false);
                  }
                }}

              />
            )}


            {/* Card de confirmation avec avatar du rep */}
            {step === "done" && selectedRep && (
              <div className="p-3">
                <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
                  <div className="h-10 w-10 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                    {selectedRep.avatarUrl ? (
                      <img
                        src={selectedRep.avatarUrl}
                        alt={selectedRep.name ?? selectedRep.userId}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-medium">
                        {(
                          selectedRep.name ||
                          selectedRep.title ||
                          "S"
                        )[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {selectedRep.name || "our team"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[
                        selectedRep.title &&
                        selectedRep.title !== (selectedRep.name || "our team")
                          ? selectedRep.title
                          : null,
                        selectedRep.regions?.length
                          ? selectedRep.regions.join(", ")
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" • ") || "Sales team"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </AIConversationContent>
        </AIConversation>
      </div>

      {/* suggestions: show at start (below greet) */}
      {suggestions.length > 0 && uiMsgs.length <= 1 && (
        <div className="flex w-full flex-wrap gap-2 px-3 pb-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition"
              onClick={() => {
                if (isSendingRef.current) return;
                form.setValue("message", s, { shouldValidate: true });
                form.handleSubmit(onSubmit)();
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}


      {/* composer — full-width: input compact */}
      <Form {...(form as any)}>
        <AIInput
          className={cn(
            "rounded-none border-x-0 border-b-0",
            isFullWidth && "border-t"
          )}
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormField
            control={form.control as any}
            name="message"
            render={({ field }) => (
              <AIInputTextarea
                minHeight={isFullWidth ? 36 : 48}
                maxHeight={isFullWidth ? 88 : 164}
                className={isFullWidth ? "py-2 px-3 text-sm" : undefined}
                disabled={
                  isPendingAssistant ||
                  conversation?.status === "resolved" ||
                  step === "ask_name" ||
                  step === "pick_rep" ||
                  step === "picking"
                }
                onChange={field.onChange}
                onKeyDown={(e) => {
                  // Enter = send, Shift+Enter = newline
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (isSendingRef.current) return;
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
          <AIInputToolbar className={isFullWidth ? "p-1.5" : undefined}>
            <AIInputTools />
            <AIInputSubmit
              className="hover:opacity-90 [&_svg]:text-[var(--nexus-send-fg)]"
              style={{
                backgroundColor: "var(--nexus-send-bg)",
                color: "var(--nexus-send-fg)",
              }}
              disabled={
                isPendingAssistant ||
                conversation?.status === "resolved" ||
                !form.formState.isValid ||
                step === "ask_name" ||
                step === "pick_rep" ||
                step === "picking"
              }
              status="ready"
              type="button"
              onClick={form.handleSubmit(onSubmit)}
            />


          </AIInputToolbar>
        </AIInput>
      </Form>

      {consentEnabled && consentCfg?.body && (
        <p className="px-3 pb-2 pt-1 text-[11px] leading-snug text-muted-foreground">
          {consentCfg.body}{" "}
          {consentCfg.linkMode === "link" && consentCfg.privacyUrl ? (
            <a
              href={consentCfg.privacyUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              here
            </a>
          ) : consentCfg.linkMode === "modal" && consentCfg.modalContent ? (
            <ConsentInlineModal
              triggerLabel="here"
              title={consentCfg.title || "Privacy & data usage"}
              fullText={consentCfg.modalContent}
            />
          ) : null}
          .
        </p>
      )}
    </div>
  );
}
