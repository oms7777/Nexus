"use client";

import { useState } from "react";
import { PublicRep } from "../screens/widget-chat-screen";


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
    <div className="w-full h-full flex flex-col gap-4">

      {/* --------- CARD WRAPPER --------- */}
      <div className="bg-white rounded-xl shadow-sm border p-5">

        {/* Header */}
        <h3 className="text-lg font-semibold mb-1">Pick a time</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Times shown in your local timezone.
        </p>

        {/* DAYS TABS */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 mb-4">
          {days.map((day, idx) => {
            const active = idx === safeIndex;
            const [weekday, ...rest] = day.split(" ");

            return (
              <button
                key={day}
                onClick={() => setActiveIndex(idx)}
                className={[
                  "min-w-[100px] rounded-full px-4 py-2 text-left border transition-all",
                  "flex flex-col justify-center shadow-sm",
                  active
                    ? "bg-primary text-primary-foreground border-primary scale-[1.02]"
                    : "bg-white hover:bg-accent text-foreground",
                ].join(" ")}
              >
                <div className="uppercase text-[10px] font-semibold tracking-wide">
                  {weekday}
                </div>
                <div className="text-sm font-semibold">{rest.join(" ")}</div>
              </button>
            );
          })}
        </div>

        {/* TIME SLOTS */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {currentSlots.map((slot, idx) => (
            <button
              key={`${slot.start}-${slot.end}-${idx}`}
              onClick={() => onPick(slot)}
              className="rounded-xl border px-4 py-3 text-sm bg-white 
                         hover:bg-primary hover:text-white 
                         shadow-sm transition-all active:scale-[0.97]"
            >
              <div className="font-medium">
                {formatTime(slot.start)} – {formatTime(slot.end)}
              </div>
            </button>
          ))}
        </div>
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
