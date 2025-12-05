"use client";

import { useState } from "react";
import type { PublicRep } from "../screens/widget-chat-screen";

type Slot = { start: number; end: number };

export default function CalendarContainerBeautified({
  rep,
  slots,
  loading,
  onPick,
  onBack,
}: {
  rep: PublicRep;
  slots: Slot[] | null;
  loading: boolean;
  onPick: (slot: Slot) => void;
  onBack: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  /* ---------------- LOADING ---------------- */
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading availability…
      </div>
    );
  }

  /* ---------------- NO SLOTS ---------------- */
  if (!slots || slots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No availability found.
      </div>
    );
  }

  /* ---------------- PROCESS SLOTS ---------------- */
  const uniq: Slot[] = Array.from(
    new Map<string, Slot>(
      slots.map((s: Slot) => [`${s.start}-${s.end}`, s])
    ).values()
  );

  const grouped: Record<string, Slot[]> = {};
  uniq.forEach((s: Slot) => {
    const d = formatDay(s.start);
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(s);
  });

  const days: string[] = Object.keys(grouped);
  const safeIndex = Math.min(activeIndex, days.length - 1);
  const currentDay: string = days[safeIndex] ?? "";
  const currentSlots: Slot[] = grouped[currentDay] ?? [];

  /* ---------------- RENDER ---------------- */
  return (
    <div className="w-full flex flex-col gap-3">

      {/* --------- HEADER REP (compact) --------- */}
      <div className="flex flex-col items-center text-center">
        {rep.avatarUrl && (
          <img
            src={rep.avatarUrl}
            alt={rep.name ?? rep.userId}
            className="w-14 h-14 rounded-full object-cover mb-2"
          />
        )}
        <div className="text-sm font-semibold">
          {rep.name || "Your expert"}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {[rep.title, rep.regions?.join(", ")]
            .filter(Boolean)
            .join(" • ")}
        </div>
        <button
          onClick={onBack}
          className="mt-1 text-[11px] underline text-muted-foreground"
        >
          ← Change sales rep
        </button>
      </div>

      {/* --------- CALENDAR BOX (mode Calendly compact) --------- */}
      <div className="rounded-lg border bg-white px-3 py-2 shadow-sm">

        {/* Days row */}
        <div className="flex gap-1 overflow-x-auto pb-1 mb-2">
          {days.map((day: string, idx: number) => {
            const active = idx === safeIndex;
            const [weekday, ...rest] = day.split(" ");

            return (
              <button
                key={day}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={[
                  "min-w-[78px] rounded-full px-3 py-1 border text-left transition",
                  "flex flex-col justify-center",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white hover:bg-accent text-foreground",
                ].join(" ")}
              >
                <span className="uppercase text-[9px] font-medium tracking-wide leading-none">
                  {weekday}
                </span>
                <span className="text-[12px] font-semibold leading-tight">
                  {rest.join(" ")}
                </span>
              </button>
            );
          })}
        </div>

        {/* Slots list → compact, comme Calendly */}
        <div className="max-h-52 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2">
            {currentSlots.map((slot: Slot, idx: number) => (
              <button
                key={`${slot.start}-${slot.end}-${idx}`}
                type="button"
                onClick={() => onPick(slot)}
                className="rounded-lg border px-3 py-2 text-[12px] leading-tight
                           bg-white hover:bg-primary hover:text-primary-foreground
                           shadow-sm transition active:scale-[0.98]"
              >
                {formatTime(slot.start)} – {formatTime(slot.end)}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-2 text-[10px] text-muted-foreground text-center">
          Times shown in your local timezone.
        </p>
      </div>
    </div>
  );
}

/* ---------------- HELPERS ---------------- */
function formatDay(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
