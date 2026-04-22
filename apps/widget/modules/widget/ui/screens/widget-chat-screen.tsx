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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  hasVapiSecretsAtom,
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
import { CalendarIcon, Loader2, MenuIcon } from "lucide-react";

import {
  AIConversation,
  AIConversationContent,
} from "@workspace/ui/components/ai/conversation";
import {
  AIInput,
  AIInputSubmit,
  AIInputTextarea,
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
import {
  getWidgetUiLanguage,
  visitorLocaleForBackend,
  widgetCopyFor,
  type WidgetUiLanguage,
} from "../../../../lib/widget-chat-i18n";
import {
  buildChatExcerptForWhatsApp,
  buildWhatsAppHandoffUrl,
  resolveWhatsAppPrefill,
} from "../../../../lib/whatsapp-handoff";
import type { PlaybookAnswer } from "../../../../lib/playbook-presets";
import {
  formatPlaybookSummaryMarkdown,
  getPlaybookSteps,
} from "../../../../lib/playbook-presets";
import PlaybookPanel from "../components/PlaybookPanel";
/* ---------------- helpers ---------------- */

const formSchema = z.object({ message: z.string().min(1) });
const HUMAN_FALLBACK_SECONDS = 30; // délai avant fallback booking


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
  whatsappPhoneDigits?: string;
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

  const tc = widgetCopyFor("en");

  if (!slots.length) {
    return (
      <div className="p-3 text-sm text-muted-foreground">
        {tc.slotsNoAvailabilityLong}
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
        {tc.slotsNoAvailability}
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
        {tc.timesLocalTimezone}
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
  uiLang,
}: {
  reps: PublicRep[];
  onPick: (rep: PublicRep) => void;
  uiLang: WidgetUiLanguage;
}) {
  const tc = widgetCopyFor(uiLang);

  if (!reps.length) return null;

  return (
    <div className="p-3">
      <div className="mb-2 text-sm text-muted-foreground">
        {tc.repPickerChoose}
      </div>
      <div className="grid grid-cols-1 gap-2">
        {reps.map((rep) => {
          const primary = rep.name || rep.title || tc.yourExpert;

          const subtitle = rep.title && rep.title !== primary ? rep.title : tc.salesTeam;

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
  uiLang,
}: {
  rep: PublicRep | null;
  slots: Slot[] | null;
  loading: boolean;
  onPick: (s: Slot) => void;
  onBack: () => void;
  uiLang: WidgetUiLanguage;
}) {
  if (!rep) return null;

  const tc = widgetCopyFor(uiLang);

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-white sm:flex-row">
      {/* LEFT SIDEBAR */}
      <div className="flex w-full shrink-0 flex-col items-center border-r p-5 text-center sm:w-[36%]" style={{ borderColor: "color-mix(in srgb, var(--widget-primary) 20%, transparent)", backgroundColor: "color-mix(in srgb, var(--widget-primary) 8%, transparent)" }}>
        <div className="mb-3 flex h-14 w-14 overflow-hidden rounded-full border-2 bg-white shadow-sm" style={{ borderColor: "color-mix(in srgb, var(--widget-primary) 40%, transparent)" }}>
          {rep.avatarUrl ? (
            <img src={rep.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-semibold" style={{ color: "var(--widget-primary)" }}>
              {(rep.name || rep.title || "S")[0]?.toUpperCase()}
            </span>
          )}
        </div>
        <h3 className="text-base font-semibold text-foreground">{rep.name || tc.yourExpert}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {rep.title || tc.salesTeam}
        </p>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {tc.yourTimezone}{" "}
          {new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).format(new Date())}
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
            {tc.repChange}
          </button>
        )}
      </div>

      {/* RIGHT: CALENDAR — min-w-0 pour que le flex ne fasse pas déborder les slots */}
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <CalendarContainerBeautified
          slots={slots}
          loading={loading}
          onPick={onPick}
          uiLang={uiLang}
        />
      </div>
    </div>
  );
}

/* ---------------- screen ---------------- */

export const WidgetChatScreen = () => {
  const widgetSettings = useAtomValue(widgetSettingsAtom);
  const uiLang = useMemo(
    () => getWidgetUiLanguage(widgetSettings ?? undefined),
    [widgetSettings],
  );
  const t = widgetCopyFor(uiLang);
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
    themePrimary;

  const chatBubbleTextColor =
    (widgetSettings as any)?.theme?.chatBubbleTextColor ??
    (widgetSettings as any)?.branding?.chatBubbleTextColor ??
    "#ffffff";

  /** Assistant text bubbles: match nudge card, avoid theme `bg-background` gray flash on refresh. */
  const assistantBubbleBg =
    (widgetSettings as any)?.theme?.nudgeBackgroundColor?.trim() || "#f1f5f9";
  const assistantBubbleFg =
    (widgetSettings as any)?.theme?.secondaryTextColor?.trim() || "#0f172a";
    
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
  /** Hard gate before sending chat (disabled: consent is “soft” in the footer unless a flow sets step to consent). */
  const mustAcceptConsent = false;

  const ensureContactSession = useMutation(api.public.contactSessions.ensure);
  const ensureContactSessionByExternal = useMutation(api.public.contactSessions.ensureByExternalId);
  const externalSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    try {
      // Avoid importing localStorage-heavy helpers in too many places; keep it simple here.
      if (typeof window === "undefined") return;
      const k = "nx_external_session_id";
      let id = window.localStorage.getItem(k);
      if (!id) {
        id = crypto.randomUUID();
        window.localStorage.setItem(k, id);
      }
      externalSessionIdRef.current = id;
    } catch {
      externalSessionIdRef.current = null;
    }
  }, []);
  // plan public (no auth) pour gating voice

  const publicPlan = useQuery(
    api.public.entitlements.getPublicPlan,
    organizationId ? { organizationId } : "skip"
  );

  const canUseVoice = !!publicPlan?.canUseVoice;
  const hasVapiSecrets = useAtomValue(hasVapiSecretsAtom);
  const voiceAssistantConfigured = !!(widgetSettings as any)?.vapiSettings?.assistantId;
  const voiceButtonEnabled = (widgetSettings as any)?.vapiSettings?.voiceButtonEnabled !== false;
  const showVoiceInHeader =
    canUseVoice && hasVapiSecrets && voiceAssistantConfigured && voiceButtonEnabled;

  const handoffTarget = useQuery(
    api.public.routing.getWhatsAppHandoffDigits,
    organizationId &&
      contactSessionId &&
      (widgetSettings as any)?.whatsappHandoffEnabled
      ? { organizationId, contactSessionId }
      : "skip"
  );

  const showWhatsAppHandoff =
    !!(widgetSettings as any)?.whatsappHandoffEnabled && !!handoffTarget?.digits;

  const whatsAppHandoffMsgsRef = useRef<
    Array<{ role: "user" | "assistant"; text: string }>
  >([]);

  const openWhatsAppHandoff = () => {
    const digits = handoffTarget?.digits;
    if (!digits) return;
    const locationHref = typeof window !== "undefined" ? window.location.href : "";
    const documentReferrer =
      typeof document !== "undefined" ? document.referrer : "";
    const chatExcerpt = buildChatExcerptForWhatsApp(
      whatsAppHandoffMsgsRef.current,
      480,
      uiLang
    );
    const text = resolveWhatsAppPrefill(
      (widgetSettings as any)?.whatsappPrefillTemplate,
      uiLang,
      { locationHref, documentReferrer, chatExcerpt }
    );
    const url = buildWhatsAppHandoffUrl(digits, text);
    window.open(url, "_blank", "noopener,noreferrer");
  };

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
  const [fallbackShown, setFallbackShown] = useState(false);

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

  // suggestion "parler à quelqu'un / booker" après réponses générales
  const softEscalationSuggestedRef = useRef(false);
  const [softEscalationActive, setSoftEscalationActive] = useState(false);
  const [pendingLongHint, setPendingLongHint] = useState(false);

  useEffect(() => {
    // reset if no conversation
    if (!conversationId) {
      fallbackShownRef.current = false;
      setFallbackShown(false);
      bookingProposedLoggedRef.current = false; 
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      return;
    }
    const isEscalated = conversation?.status === "escalated";
    if (!isEscalated) {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      fallbackShownRef.current = false;
      setFallbackShown(false);
      bookingProposedLoggedRef.current = false; 
      return;
    }

    const isResolved = conversation?.status === "resolved";
    const humanAlreadyReplied = hasRepStarted === true;

    // stop fallback if resolved OR human replied OR not idle
    if (isResolved || humanAlreadyReplied || step !== "idle") {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      fallbackShownRef.current = false;
      setFallbackShown(false);
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
      setFallbackShown(true);

      // ✅ log booking_proposed once
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
          text: t.teammateTimeoutBooking,
        },
      ]);
    }, HUMAN_FALLBACK_SECONDS * 1000);

    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, [
    conversationId,
    conversation?.status,
    hasRepStarted,
    step,
    organizationId,
    contactSessionId,
    logEvent,
    t.teammateTimeoutBooking,
  ]);



  // local messages + booking
  const [localMsgs, setLocalMsgs] = useState<
    Array<{ role: "assistant" | "user"; text: string }>
  >([]);

  const playbookPresetRaw =
    ((widgetSettings as any)?.playbookPresetId as string | undefined) ?? "off";
  const playbookSteps = useMemo(
    () => getPlaybookSteps(playbookPresetRaw),
    [playbookPresetRaw],
  );

  const playbookStorageKey =
    organizationId && playbookPresetRaw !== "off"
      ? `nexus_pb_${organizationId}_${playbookPresetRaw}`
      : null;

  function readPlaybookDone(key: string | null): boolean {
    if (!key || typeof sessionStorage === "undefined") return false;
    try {
      const v = sessionStorage.getItem(key);
      return v === "1" || v === "skip";
    } catch {
      return false;
    }
  }

  const [playbookDone, setPlaybookDone] = useState(false);

  useEffect(() => {
    setPlaybookDone(readPlaybookDone(playbookStorageKey));
  }, [playbookStorageKey]);

  const playbookBlocking =
    !!playbookSteps?.length &&
    !playbookDone &&
    step === "idle" &&
    playbookPresetRaw === "book_demo_qual_v1";

  const finishPlaybook = useCallback(
    (answers: Record<string, PlaybookAnswer>) => {
      if (playbookStorageKey) sessionStorage.setItem(playbookStorageKey, "1");
      setPlaybookDone(true);
      const md = formatPlaybookSummaryMarkdown(playbookSteps!, answers, uiLang);
      const gm = widgetSettings?.greetMessage?.trim();
      if (gm) {
        setLocalMsgs([
          { role: "assistant", text: gm },
          { role: "assistant", text: md },
        ]);
      } else {
        setLocalMsgs([{ role: "assistant", text: md }]);
      }
    },
    [playbookStorageKey, playbookSteps, uiLang, widgetSettings?.greetMessage],
  );

  const skipPlaybook = useCallback(() => {
    if (playbookStorageKey) sessionStorage.setItem(playbookStorageKey, "skip");
    setPlaybookDone(true);
  }, [playbookStorageKey]);

  // --- pending assistant (prevents "silent" UX + fixes "needs 2nd message" perception)
  const [isPendingAssistant, setIsPendingAssistant] = useState(false);
  const assistantCountAtSendRef = useRef(0);
  const pendingTimeoutRef = useRef<any>(null);
  const pendingUiDelayRef = useRef<any>(null);
  const [showPendingUi, setShowPendingUi] = useState(false);
  useEffect(() => {
    if (step !== "idle") {
      setIsPendingAssistant(false);
      setPendingLongHint(false);
      if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
      if (pendingUiDelayRef.current) clearTimeout(pendingUiDelayRef.current);
      pendingUiDelayRef.current = null;
      setShowPendingUi(false);
    }
  }, [step]);
  const pendingFallbackShownRef = useRef(false);

  // Delay the pending bubble to avoid UI flicker on fast responses.
  useEffect(() => {
    if (!isPendingAssistant) {
      if (pendingUiDelayRef.current) clearTimeout(pendingUiDelayRef.current);
      pendingUiDelayRef.current = null;
      setShowPendingUi(false);
      return;
    }
    if (showPendingUi) return;
    if (pendingUiDelayRef.current) clearTimeout(pendingUiDelayRef.current);
    pendingUiDelayRef.current = setTimeout(() => {
      setShowPendingUi(true);
      pendingUiDelayRef.current = null;
    }, 800);
    return () => {
      if (pendingUiDelayRef.current) {
        clearTimeout(pendingUiDelayRef.current);
        pendingUiDelayRef.current = null;
      }
    };
  }, [isPendingAssistant, showPendingUi]);

  useEffect(() => {
    return () => {
      if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
      if (pendingUiDelayRef.current) clearTimeout(pendingUiDelayRef.current);
    };
  }, []);






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
      whatsappPhoneDigits: rep.whatsappPhoneDigits,
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
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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
        const ext = externalSessionIdRef.current;
        sessionId = ext
          ? ((await ensureContactSessionByExternal({
              organizationId,
              externalSessionId: ext,
            } as any)) as any)
          : ((await ensureContactSession({ organizationId })) as any);
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
          text: t.bookDemoDetails,
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
    t.bookDemoDetails,
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
        text: t.matchingSpecialist,
      },
    ]);

    if (!organizationId || !contactSessionId) {
      setStep("done");
      return;
    }
    if (!routingReady) {
      setLocalMsgs((m) => [
        ...m,
        { role: "assistant", text: t.loadingAvailability },
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
            text: t.noTeammateNow,
          },
        ]);
        setStep("done");
        return;
      }

      setLocalMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text: t.assignRightPerson,
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
      { role: "assistant", text: t.findingBestTime },
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
          whatsappPhoneDigits: res.rep.whatsappPhoneDigits,
        });

        setSlots(res.slots);
        setStep("picking");
        return;
      }

      // aucun rep dispo
      setLocalMsgs((m) => [
        ...m,
        { role: "assistant", text: t.noTimesNow },
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
      const rawText = values.message.trim();
      if (!rawText) return;
      let textToSend = rawText;

      // Deterministic handling for short yes/no responses.
      // Goal: when user answers "yes/oui" to the last bot option (talk to someone / book a meeting),
      // we trigger the right flow without relying on the LLM to interpret the intent perfectly.
      const normalized = rawText.toLowerCase().replace(/[’]/g, "'").trim();
      const isYes = /^(yes|oui|yeah|yep|sure|ok|okay|certainly|absolutely)$/i.test(normalized);
      const isNo = /^(no|non|nah|nope)$/i.test(normalized);

      const backendUIMsgs = toUIMessages(messages.results ?? []);
      const lastAssistantText = [...localMsgs, ...backendUIMsgs]
        .filter((m: any) => m?.role === "assistant")
        .map((m: any) => String(m?.text ?? ""))
        .at(-1);

      const lastHasTalkOption =
        /talk to someone|human teammate|connect you with a human|speak to a human|representative|parler à quelqu|membre de l.?équipe|équipe humaine|mettre en relation|spécialiste humain/i.test(
          lastAssistantText ?? "",
        );
      const lastHasBookingOption =
        /book a meeting|pick a slot|pick a time|book a quick meeting|prendre rendez-vous|réserver|créneau|rendez-vous/i.test(
          lastAssistantText ?? "",
        );

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
      if (step === "idle" && /book|demo|meeting/i.test(rawText)) {
        setLocalMsgs((m) => [...m, { role: "user", text: rawText }]);
        setBookingIntent("book");

        if (!consentEnabled || consentGiven) {
          setStep("ask_name");
          setLocalMsgs((m) => [
            ...m,
            { role: "assistant", text: t.bookDemoDetails },
          ]);
        } else {
          setStep("consent");
        }
        return;
      }

      // yes/no mapping based on the last assistant option
      if ((isYes || isNo) && (lastHasTalkOption || lastHasBookingOption)) {
        // If both "talk to someone" and "booking" are present, "oui" should default to talking to a human.
        if (lastHasBookingOption && isYes && !lastHasTalkOption) {
          // Open the booking UI deterministically.
          startBookingLikePromo();
          return;
        }

        if (lastHasTalkOption) {
          // Force backend deterministic escalation using "human intent" keyword detector.
          textToSend = isYes ? t.talkToSomeone : t.continueToChat;
          setSoftEscalationActive(false);
        }
      }

      // human handoff: on laisse le backend répondre "Got it..." (évite doublon)
      if (
        step === "idle" &&
        /\b(human|someone|teammate|agent|person|representative|advisor|humain|quelqu'un|conseiller|opérateur|représentant)\b/i.test(
          rawText,
        )
      ) {
        setSoftEscalationActive(false);
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
          { role: "assistant", text: t.oneSecReadyResend },
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
          { role: "assistant", text: t.preparingChatResend },
        ]);
        return;
      }

      pendingFallbackShownRef.current = false;

      // pending UI (typing)
      assistantCountAtSendRef.current = backendAssistantCount;
      setIsPendingAssistant(true);
      setPendingLongHint(false);
      setShowPendingUi(false);

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
        // Non-persistent hint below typing indicator (keeps chat clean).
        setPendingLongHint(true);
        // Timer consumed; avoid stale ids causing weird states.
        pendingTimeoutRef.current = null;
      }, 12000);


      try {
        await createMessage({
          threadId: thr,
          prompt: textToSend,
          contactSessionId,
          visitorLocale: visitorLocaleForBackend(uiLang),
        });
      } catch {
        setIsPendingAssistant(false);
        if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
        setLocalMsgs((m) => [...m, { role: "assistant", text: t.networkHiccup }]);
      }
    } finally {
      isSendingRef.current = false;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  // helper: déclenche une demande "talk to someone" via bouton
  const triggerTalkToSomeone = () => {
    if (isSendingRef.current) return;
    setSoftEscalationActive(false);
    form.setValue("message", t.talkToSomeone, { shouldValidate: true } as any);
    form.handleSubmit(onSubmit)();
  };


  /* -------- MESSAGES + GREET -------- */
  const backendMsgs = toUIMessages(messages.results ?? [])
    .filter((m) => String(m.content ?? "").trim().length > 0)
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      text: String(m.content ?? ""),
    }));

  const backendAssistantCount = backendMsgs.filter((m) => m.role === "assistant").length;

  const backendAssistantCountRef = useRef(0);
  useEffect(() => {
    backendAssistantCountRef.current = backendAssistantCount;
  }, [backendAssistantCount]);

  // après X réponses IA (hors greet), proposer "Talk to someone" / "Continue to chat"
  useEffect(() => {
    if (softEscalationSuggestedRef.current) return;
    if (!organizationId || !conversationId) return;
    if (!widgetSettings) return; // attendre le chargement des settings (évite trigger trop tôt avec défaut 3)

    const statusNow = conversation?.status;
    if (statusNow === "escalated" || statusNow === "resolved") return;
    if (step !== "idle") return;

    const greet = (widgetSettings as any)?.greetMessage?.trim();
    const realAssistantCount = backendMsgs.filter(
      (m) =>
        m.role === "assistant" &&
        (!greet || (m.text ?? "").trim() !== greet)
    ).length;

    const triggerCount =
      (widgetSettings as any)?.escalationSuggestionAfterMessages ?? 3;
    if (triggerCount > 0 && realAssistantCount >= triggerCount) {
      softEscalationSuggestedRef.current = true;
      setSoftEscalationActive(true);
    }
  }, [
    backendMsgs,
    conversation?.status,
    step,
    organizationId,
    conversationId,
    widgetSettings,
    t.escalationSuggestion,
  ]);

  const prevPendingRef = useRef(isPendingAssistant);
  useEffect(() => {
    if (!isPendingAssistant) return;
    if (backendAssistantCount > assistantCountAtSendRef.current) {
      setIsPendingAssistant(false);
      setPendingLongHint(false);
      setShowPendingUi(false);
      pendingFallbackShownRef.current = false;
      if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
      if (pendingUiDelayRef.current) clearTimeout(pendingUiDelayRef.current);
      pendingUiDelayRef.current = null;
    }
  }, [backendAssistantCount, isPendingAssistant]);

  useEffect(() => {
    if (prevPendingRef.current && !isPendingAssistant) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
    prevPendingRef.current = isPendingAssistant;
  }, [isPendingAssistant]);

  const greet = widgetSettings?.greetMessage?.trim();

  const filteredBackend = greet
    ? backendMsgs.filter((m) => String(m.text ?? "").trim() !== greet)
    : backendMsgs;

  let baseMsgs = [...filteredBackend, ...localMsgs];

  // Réordonner les messages système d'escalade / booking sans toucher aux réponses humaines :
  // 1) "If you'd like..." (suggestion)
  // 2) "Got it! Connecting..." (handoff)
  // 3) "If no teammate answers..." (fallback booking)
  // Ils doivent toujours apparaître dans cet ordre et AVANT les réponses de l'opérateur.
  const normalizeText = (s: unknown) =>
    String(s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’]/g, "'")
      .trim();

  const isGotIt = (text: string) => {
    const n = normalizeText(text);
    const en = n.includes("got it") && n.includes("connecting you with a human teammate");
    const fr =
      (n.includes("parfait") || n.includes("compris")) &&
      (n.includes("relation") || n.includes("connect")) &&
      (n.includes("equipe") || n.includes("membre"));
    return en || fr;
  };

  const isIfYoulike = (text: string) => {
    const n = normalizeText(text);
    const en = n.includes("if you'd like to go deeper") && n.includes("human teammate");
    const fr =
      n.includes("pour aller plus loin") &&
      (n.includes("equipe") || n.includes("humain") || n.includes("rendez-vous"));
    return en || fr;
  };

  const isFallbackBooking = (text: string) => {
    const n = normalizeText(text);
    const en =
      n.includes("if no teammate answers right away") && n.includes("book a meeting");
    const fr =
      n.includes("personne") && n.includes("repond") &&
      (n.includes("equipe") || n.includes("rendez-vous") || n.includes("reserver"));
    const bookingHint =
      n.includes("book a meeting") ||
      n.includes("pick a slot") ||
      n.includes("prendre rendez-vous") ||
      n.includes("reserver") ||
      n.includes("creneau");
    return en || (fr && bookingHint);
  };

  const gotItIdx = baseMsgs.findIndex((m) => isGotIt(String(m.text ?? "")));
  const ifYoulikeIdx = baseMsgs.findIndex((m) => isIfYoulike(String(m.text ?? "")));
  const fallbackIdx = baseMsgs.findIndex((m) => isFallbackBooking(String(m.text ?? "")));

  const systemIndices = [gotItIdx, ifYoulikeIdx, fallbackIdx].filter((i) => i >= 0);
  if (systemIndices.length > 0) {
    const firstIdx = Math.min(...systemIndices);

    // Construire le cluster dans l'ordre voulu, en ne prenant que ceux qui existent.
    const systemCluster: typeof baseMsgs = [];
    if (ifYoulikeIdx !== -1) systemCluster.push(baseMsgs[ifYoulikeIdx]!);
    if (gotItIdx !== -1) systemCluster.push(baseMsgs[gotItIdx]!);
    if (fallbackIdx !== -1) systemCluster.push(baseMsgs[fallbackIdx]!);

    const indicesSet = new Set(systemIndices);
    const reordered: typeof baseMsgs = [];
    let clusterInserted = false;

    baseMsgs.forEach((msg, idx) => {
      if (idx === firstIdx && !clusterInserted) {
        reordered.push(...systemCluster);
        clusterInserted = true;
      }
      if (!indicesSet.has(idx)) {
        reordered.push(msg);
      }
    });

    if (!clusterInserted) {
      reordered.push(...systemCluster);
    }

    baseMsgs = reordered;
  }

  let uiMsgs = baseMsgs;

  // Always show greet as first message when present and no actual messages yet
  if (greet && uiMsgs.length === 0 && !playbookBlocking) {
    uiMsgs = [{ role: "assistant" as const, text: greet }];
  }

  whatsAppHandoffMsgsRef.current = uiMsgs;


  const suggestions = useMemo(() => {
    const base = widgetSettings?.defaultSuggestions
      ? Object.values(widgetSettings.defaultSuggestions).filter(
          (v) => v != null && String(v).trim().length > 0,
        )
      : [];
    return Array.from(new Set(base.map((s) => String(s).trim()))).filter(
      (s) => s.length > 0,
    );
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
      {/* Top overlay: voice centered, calendar / WhatsApp / close on the right (iframe embed only). */}
      {typeof window !== "undefined" && window !== window.parent && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3">
          <span className="min-w-0" aria-hidden />
          <div className="pointer-events-auto flex justify-center">
            {showVoiceInHeader ? (
              <VoiceCallButton
                attentionPulse
                className="size-9 border border-white/20 shadow-md"
                gateVoiceOnConsent={consentEnabled}
              />
            ) : null}
          </div>
          <div className="pointer-events-auto flex max-w-[min(52vw,14rem)] flex-wrap items-center justify-end gap-1.5 justify-self-end">
            <button
              type="button"
              onClick={startBookingLikePromo}
              title={t.bookMeeting}
              className="size-9 flex items-center justify-center rounded-full border border-white/20 shadow-md transition-all hover:scale-[1.03] active:scale-[0.98]"
              style={{ backgroundColor: "var(--widget-primary)", color: "var(--widget-primary-text)" }}
            >
              <CalendarIcon className="size-4" aria-hidden />
            </button>
            {showWhatsAppHandoff ? (
              <button
                type="button"
                onClick={openWhatsAppHandoff}
                title={t.whatsappHandoff}
                className="size-9 flex items-center justify-center rounded-full border border-white/20 bg-[#25D366] text-white shadow-md transition-all hover:scale-[1.03] hover:bg-[#20bd5a] active:scale-[0.98]"
                aria-label={t.whatsappHandoff}
              >
                <svg
                  className="size-[18px]"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => window.parent?.postMessage({ type: "close" }, "*")}
              title={t.close}
              className="size-9 flex items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-600 shadow-md transition-all hover:bg-slate-50 active:scale-[0.98]"
              aria-label={t.close}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Header: who you’re talking to + short promise (clarity like modern B2B widgets) */}
      <div className="relative z-10 shrink-0 border-b border-slate-200/60 bg-gradient-to-b from-slate-50/95 to-white px-4 pb-3.5 pt-4 sm:pt-5">
        <div className="flex items-start gap-3 pr-[min(42vw,12rem)] sm:pr-[13rem]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
            <img
              src={brandLogoUrl}
              alt=""
              className="h-full w-full object-contain p-1.5"
            />
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 className="truncate text-[15px] font-semibold leading-tight tracking-tight text-slate-900">
              {t.chatTitle}
            </h2>
          </div>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <AIConversation className="h-full flex flex-col">
          <AIConversationContent
            className={cn(
              "flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden",
              isFullWidth && "px-3 pt-2"
            )}
          >
            {uiMsgs.map((m, i) => {
              const isUser = m.role === "user";

              return (
                <AIMessage key={i} from={isUser ? "user" : "assistant"}>
                  <AIMessageContent
                    className="rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm"
                    style={
                      isUser
                        ? {
                            backgroundColor: themePrimary,
                            color: themePrimaryText,
                            borderColor: "transparent",
                          }
                        : {
                            backgroundColor: assistantBubbleBg,
                            color: assistantBubbleFg,
                            borderColor: "rgba(15,23,42,0.08)",
                          }
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

            {isPendingAssistant && step === "idle" && showPendingUi && (
              <AIMessage from="assistant">
                <AIMessageContent
                  className="rounded-2xl px-3.5 py-2.5 text-[13px] shadow-sm"
                  style={{
                    backgroundColor: assistantBubbleBg,
                    color: assistantBubbleFg,
                    borderColor: "rgba(15,23,42,0.08)",
                  }}
                >
                  <div
                    className="flex items-center gap-2"
                    role="status"
                    aria-live="polite"
                    aria-label={t.assistantTyping}
                  >
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin opacity-80"
                      style={{ color: themePrimary }}
                      aria-hidden
                    />
                    <div className="flex flex-col gap-1">
                      {pendingLongHint && (
                        <span className="text-[12px] leading-snug opacity-80">
                          {t.preparingResponse}
                        </span>
                      )}
                    </div>
                  </div>
                </AIMessageContent>
                <DicebearAvatar imageUrl={brandLogoUrl} seed="assistant" size={32} />
              </AIMessage>
            )}


            {conversationId &&
              conversation?.status === "escalated" &&
              hasRepStarted !== true &&
              fallbackShown &&
              step === "idle" && (
                <div className="p-3">
                  <Button
                    className="w-full border-0 text-sm font-semibold"
                    style={{
                      backgroundColor: themePrimary,
                      color: themePrimaryText,
                    }}
                    onClick={startBookingLikePromo}
                  >
                    {t.bookMeeting}
                  </Button>
                </div>
              )}

            {softEscalationActive &&
              (!conversation || (conversation.status !== "escalated" && conversation.status !== "resolved")) &&
              step === "idle" && (
                <div className="flex flex-col gap-2 p-3">
                  <div className="text-xs text-muted-foreground">
                    {t.preferSpecialist}
                  </div>
                  <div
                    className="rounded-xl border px-3 py-2 text-[12.5px] leading-relaxed"
                    style={{
                      backgroundColor: assistantBubbleBg,
                      color: assistantBubbleFg,
                      borderColor: "rgba(15,23,42,0.08)",
                    }}
                  >
                    <AIResponse>{t.escalationSuggestion}</AIResponse>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      className="flex-1 border-0 text-xs font-semibold hover:opacity-95"
                      style={{
                        backgroundColor: themePrimary,
                        color: themePrimaryText,
                      }}
                      onClick={triggerTalkToSomeone}
                    >
                      {t.talkToSomeoneButton}
                    </Button>
                    <Button
                      variant="ghost"
                      className="flex-1 text-xs"
                      onClick={() => setSoftEscalationActive(false)}
                    >
                      {t.continueToChatButton}
                    </Button>
                  </div>
                </div>
              )}




              {step === "auto_assign_wait" && (
                <div className="p-3 text-sm text-muted-foreground">
                  {t.assigningRep}
                </div>
              )}


            {/* consent card */}
            {step === "consent" && consentEnabled && consentCfg && (
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
                      {consentCfg.body || t.consentBodyDefault}{" "}
                      {(() => {
                        const linkMode = consentCfg.linkMode ?? "link";
                        const consentUrl = consentCfg.privacyUrl;
                        const consentModalText = consentCfg.modalContent;
                        if (linkMode === "link" && consentUrl) {
                          return (
                            <>
                              {t.consentLinkIntro}{" "}
                              <a
                                href={consentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="underline"
                              >
                                {t.hereLink}
                              </a>
                              .
                            </>
                          );
                        }
                        return (
                          <ConsentInlineModal
                            triggerLabel={t.hereLink}
                            title={consentCfg.title ?? "Consent"}
                            fullText={
                              (consentModalText?.trim() ||
                                consentCfg.body?.trim() ||
                                t.detailsDataProcessed) + t.consentWithdrawFooter
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
                              text: t.bookDemoDetails,
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
                uiLang={uiLang}
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
                uiLang={uiLang}
              />
            )}


            {/* NEW picking flow : Sidebar rep + Calendar à droite */}
            {step === "picking" && selectedRep && (
              <div className="min-w-0 max-w-full overflow-hidden">
              <BookingSplitLayout
                rep={selectedRep}
                slots={slots}
                loading={loadingSlots}
                uiLang={uiLang}
                onPick={async (slot) => {
                  if (!organizationId || !contactSessionId || !qdata.name || !qdata.email) return;

                  try {
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
                        text: t.youAreBooked(
                          selectedRep?.name || t.ourTeam,
                          res?.meetingUrl || t.meetingUrlFallback,
                        ),
                      },
                    ]);

                    setSlots(null);
                    setStep("done");
                  } catch (e: unknown) {
                    const anyE = e as { data?: { message?: string }; message?: string };
                    const msg =
                      (typeof anyE?.data?.message === "string" && anyE.data.message) ||
                      (typeof anyE?.message === "string" && anyE.message) ||
                      "Booking failed. Please try again.";
                    setLocalMsgs((m) => [
                      ...m,
                      { role: "assistant", text: msg.length > 280 ? `${msg.slice(0, 280)}…` : msg },
                    ]);
                  }
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
                        whatsappPhoneDigits: res.rep.whatsappPhoneDigits,
                      });
                      setSlots(res.slots);
                      setStep("picking");
                      return;
                    }

                    setLocalMsgs((m) => [
                      ...m,
                      { role: "assistant", text: t.noAvailabilityTryLater },
                    ]);
                    setStep("done");
                  } finally {
                    setLoadingSlots(false);
                  }
                }}

              />
              </div>
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
                      {selectedRep.name || t.ourTeam}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {selectedRep.title &&
                      selectedRep.title !== (selectedRep.name || t.ourTeam)
                        ? selectedRep.title
                        : t.salesTeam}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </AIConversationContent>
        </AIConversation>

        {playbookBlocking && playbookSteps?.length ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-end bg-gradient-to-t from-white via-white/85 to-white/25 px-3 pb-5 pt-24">
            <PlaybookPanel
              className="pointer-events-auto shadow-2xl"
              steps={playbookSteps}
              uiLang={uiLang}
              t={t}
              primaryBg={themePrimary}
              primaryFg={themePrimaryText}
              onComplete={finishPlaybook}
              onSkip={skipPlaybook}
            />
          </div>
        ) : null}
      </div>

      {/* suggestions: show at start (below greet) */}
      {suggestions.length > 0 && uiMsgs.length <= 1 && !playbookBlocking && (
        <div className="border-t border-slate-100/90 bg-gradient-to-b from-slate-50/60 to-slate-50/30 px-3 py-1.5">
          <div className="flex w-full flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="rounded-xl border border-slate-200/90 bg-white px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white hover:shadow-md active:scale-[0.99]"
                style={{
                  borderColor: "color-mix(in srgb, var(--widget-primary) 22%, transparent)",
                }}
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
        </div>
      )}


      {/* composer — input + send icon sur une seule ligne (type your message à droite de l'icône) */}
      <Form {...(form as any)}>
        <AIInput
          className={cn(
            "flex flex-row items-end gap-2 !divide-y-0 border-0 border-t border-slate-200/70 bg-gradient-to-t from-slate-100/50 to-slate-50/30 px-3 pb-3 pt-2",
            isFullWidth && "border-t",
            playbookBlocking && "pointer-events-none opacity-40",
          )}
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <div className="flex flex-1 min-w-0 items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-slate-200/50 transition-shadow focus-within:ring-2 focus-within:ring-[var(--widget-primary)]/35">
            <FormField
              control={form.control as any}
              name="message"
              render={({ field }) => (
                <AIInputTextarea
                  ref={inputRef}
                  autoFocus
                  minHeight={36}
                  maxHeight={96}
                  className="min-h-[36px] flex-1 resize-none border-0 bg-transparent px-0 py-2 text-[14px] leading-snug text-slate-900 placeholder:text-slate-400 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  // Allow typing while assistant is thinking; only block sending.
                  disabled={false}
                  onChange={field.onChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (isSendingRef.current) return;
                      form.handleSubmit(onSubmit)();
                    }
                  }}
                  placeholder={t.placeholderMessage}
                  aria-label="Message"
                  value={field.value}
                />
              )}
            />
            <AIInputSubmit
              className="h-8 w-8 shrink-0 rounded-full hover:opacity-90 [&_svg]:size-4 [&_svg]:text-[var(--nexus-send-fg)]"
              style={{
                backgroundColor: "var(--nexus-send-bg)",
                color: "var(--nexus-send-fg)",
              }}
              disabled={isPendingAssistant || !form.formState.isValid}
              status="ready"
              type="button"
              onClick={form.handleSubmit(onSubmit)}
            />
          </div>
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
              {t.hereLink}
            </a>
          ) : consentCfg.linkMode === "modal" && consentCfg.modalContent ? (
            <ConsentInlineModal
              triggerLabel={t.hereLink}
              title={consentCfg.title || t.privacyDefaultTitle}
              fullText={consentCfg.modalContent}
            />
          ) : null}
          .
        </p>
      )}
    </div>
  );
}
