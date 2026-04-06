"use client";

import { useState } from "react";
import {
  getFormattingLocaleForWidget,
  widgetCopyFor,
  type WidgetUiLanguage,
} from "../../../../lib/widget-chat-i18n";

type Slot = { start: number; end: number };

export default function CalendarContainerBeautified({
  slots,
  loading,
  onPick,
  uiLang = "en",
}: {
  slots: Slot[] | null;
  loading: boolean;
  onPick: (slot: Slot) => void;
  uiLang?: WidgetUiLanguage;
}) {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const tc = widgetCopyFor(uiLang);
  const intlLocale = getFormattingLocaleForWidget(uiLang);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div className="h-2 w-24 animate-pulse rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--widget-primary) 25%, transparent)" }} />
        <p className="text-xs text-muted-foreground">{tc.calendarLoading}</p>
      </div>
    );
  }

  if (!slots || slots.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border p-6" style={{ borderColor: "color-mix(in srgb, var(--widget-primary) 20%, transparent)", backgroundColor: "color-mix(in srgb, var(--widget-primary) 8%, transparent)" }}>
        <p className="text-sm font-medium text-foreground">{tc.calendarNoAvailability}</p>
        <p className="text-xs text-muted-foreground">{tc.calendarTryAnother}</p>
      </div>
    );
  }

  const uniq: Slot[] = Array.from(
    new Map<string, Slot>(slots.map((s: Slot) => [`${s.start}-${s.end}`, s])).values()
  );

  const grouped: Record<string, Slot[]> = {};
  uniq.forEach((s: Slot) => {
    const d = formatDay(s.start, intlLocale);
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(s);
  });

  const days: string[] = Object.keys(grouped);
  const safeIndex = Math.min(activeIndex, days.length - 1);
  const currentDay: string = days[safeIndex] ?? "";
  const currentSlots: Slot[] = grouped[currentDay] ?? [];
  const monthLabel = days.length > 0 ? getMonthLabel(currentDay, grouped, intlLocale) : "";

  return (
    <div className="flex h-full w-full min-w-0 max-w-full flex-col gap-4 overflow-hidden">
      <div className="shrink-0 text-center">
        <h3 className="text-sm font-semibold text-foreground">{tc.calendarPickTime}</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {tc.calendarTimesTimezone}
        </p>
      </div>

      {monthLabel && (
        <p className="shrink-0 text-center text-xs font-medium text-muted-foreground">
          {monthLabel}
        </p>
      )}

      <div className="flex min-w-0 gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
        {days.map((day, idx) => {
          const active = idx === safeIndex;
          const firstSlot = grouped[day]?.[0];
          const label = firstSlot
            ? formatWeekdayAndDay(firstSlot.start, intlLocale)
            : formatDayShort(day);
          return (
            <button
              key={day}
              onClick={() => setActiveIndex(idx)}
              className={[
                "min-w-[72px] shrink-0 rounded-xl px-2.5 py-2 text-center text-xs transition",
                "flex flex-col justify-center border",
                active ? "shadow-sm" : "bg-white text-foreground",
              ].join(" ")}
              style={
                active
                  ? { backgroundColor: "var(--widget-primary)", color: "var(--widget-primary-text)", borderColor: "var(--widget-primary)" }
                  : { borderColor: "color-mix(in srgb, var(--widget-primary) 20%, transparent)" }
              }
            >
              <span className="uppercase tracking-wide opacity-90">{label.weekday}</span>
              <span className="font-semibold">{label.day}</span>
            </button>
          );
        })}
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2 overflow-auto content-start">
        {currentSlots.map((slot, idx) => (
          <button
            key={`${slot.start}-${slot.end}-${idx}`}
            onClick={() => onPick(slot)}
            className="min-w-0 rounded-xl border bg-white px-2 py-2.5 text-xs font-medium transition active:scale-[0.98] truncate"
            style={{
              borderColor: "color-mix(in srgb, var(--widget-primary) 25%, transparent)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--widget-primary)";
              e.currentTarget.style.color = "var(--widget-primary-text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "";
              e.currentTarget.style.color = "";
            }}
          >
            {formatTime(slot.start, intlLocale)} – {formatTime(slot.end, intlLocale)}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- HELPERS ---------------- */

function formatDay(ts: number, intlLocale: string): string {
  return new Date(ts).toLocaleDateString(intlLocale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(ts: number, intlLocale: string): string {
  return new Date(ts).toLocaleTimeString(intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** À partir du timestamp : uniquement jour de la semaine + numéro du jour (jamais le mois). */
function formatWeekdayAndDay(ts: number, intlLocale: string): { weekday: string; day: string } {
  const d = new Date(ts);
  const weekday = d
    .toLocaleDateString(intlLocale, { weekday: "short" })
    .replace(/,/g, "")
    .trim()
    .slice(0, 3)
    .toUpperCase();
  const day = d.toLocaleDateString(intlLocale, { day: "numeric" });
  return { weekday, day };
}

/** Fallback si pas de slot (ne doit pas afficher le mois). */
function formatDayShort(dayKey: string): { weekday: string; day: string } {
  const parts = dayKey.replace(/,/g, "").trim().split(/\s+/);
  const weekday = (parts[0] ?? "").toUpperCase().slice(0, 3);
  const day = parts[1] ?? "";
  return { weekday, day };
}

/** Mois + année affichés une seule fois au-dessus des jours (ex. "March 2026"). */
function getMonthLabel(
  firstDayKey: string,
  grouped: Record<string, Slot[]>,
  intlLocale: string,
): string {
  const slots = grouped[firstDayKey];
  const ts = slots?.[0]?.start;
  if (ts == null) return "";
  return new Date(ts).toLocaleDateString(intlLocale, { month: "long", year: "numeric" });
}
