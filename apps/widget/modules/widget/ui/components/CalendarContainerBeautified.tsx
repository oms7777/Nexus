"use client";

import { useState } from "react";

type Slot = { start: number; end: number };

export default function CalendarContainerBeautified({
  slots,
  loading,
  onPick,
}: {
  slots: Slot[] | null;
  loading: boolean;
  onPick: (slot: Slot) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  /* ---------------- LOADING ---------------- */
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading availability…
      </div>
    );
  }

  /* ---------------- NO SLOTS ---------------- */
  if (!slots || slots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No availability found.
      </div>
    );
  }

  /* ---------------- PROCESSING SLOTS ---------------- */
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

  const days = Object.keys(grouped);
  const safeIndex = Math.min(activeIndex, days.length - 1);
  const currentDay: string = days[safeIndex] ?? "";
  const currentSlots: Slot[] = grouped[currentDay] ?? [];

  /* ---------------- RENDER ---------------- */
  return (
    <div className="w-full h-full flex flex-col gap-3">

      {/* Header simple, style Calendly */}
      <div className="text-center">
        <h3 className="text-sm font-semibold">Pick a time</h3>
        <p className="text-[11px] text-muted-foreground">
          Times shown in your local timezone.
        </p>
      </div>

      {/* DAYS TABS */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {days.map((day, idx) => {
          const active = idx === safeIndex;
          const [weekday, ...rest] = day.split(" ");

          return (
            <button
              key={day}
              onClick={() => setActiveIndex(idx)}
              className={[
                "min-w-[90px] rounded-full px-3 py-1.5 text-left border text-xs",
                "flex flex-col justify-center",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white hover:bg-accent text-foreground",
              ].join(" ")}
            >
              <span className="uppercase tracking-wide">{weekday}</span>
              <span className="text-xs font-semibold">{rest.join(" ")}</span>
            </button>
          );
        })}
      </div>

      {/* TIME SLOTS */}
      <div className="grid grid-cols-2 gap-2">
        {currentSlots.map((slot, idx) => (
          <button
            key={`${slot.start}-${slot.end}-${idx}`}
            onClick={() => onPick(slot)}
            className="rounded-lg border px-3 py-2 text-xs bg-white
                       hover:bg-primary hover:text-white
                       shadow-sm transition-all active:scale-[0.97]"
          >
            <span className="font-medium">
              {formatTime(slot.start)} – {formatTime(slot.end)}
            </span>
          </button>
        ))}
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
