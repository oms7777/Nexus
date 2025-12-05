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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading availability…
      </div>
    );
  }

  if (!slots || slots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No availability found.
      </div>
    );
  }

  // Deduplicate with correct typing
  const uniq: Slot[] = Array.from(
    new Map<string, Slot>(slots.map((s: Slot) => [`${s.start}-${s.end}`, s])).values()
  );

  // Group slots by day
  const grouped: Record<string, Slot[]> = {};
  uniq.forEach((s: Slot) => {
    const d = formatDay(s.start);
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(s);
  });

  const days: string[] = Object.keys(grouped);

  // Avoid undefined index
  const safeIndex = Math.min(activeIndex, days.length - 1);

  // Force type → plus d’erreur “undefined cannot be used as index type”
  const currentDay: string = days[safeIndex] ?? "";
  const currentSlots: Slot[] = grouped[currentDay] ?? [];

  return (
    <div className="h-full flex flex-col p-3">

      {/* Header */}
      <div className="mb-3">
        <h3 className="text-base font-semibold">Pick a time</h3>
        <p className="text-xs text-muted-foreground">
          Times shown in your local timezone.
        </p>
      </div>

      {/* Days */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
        {days.map((day: string, idx: number) => {
          const active = idx === safeIndex;
          const [weekday, ...rest] = day.split(" ");

          return (
            <button
              key={day}
              onClick={() => setActiveIndex(idx)}
              className={[
                "min-w-[110px] rounded-xl px-3 py-2 text-left transition border",
                active
                  ? "bg-primary border-primary text-primary-foreground shadow"
                  : "bg-background hover:bg-accent text-foreground",
              ].join(" ")}
            >
              <div className="uppercase text-[11px] tracking-wide">{weekday}</div>
              <div className="font-semibold text-sm">{rest.join(" ")}</div>
            </button>
          );
        })}
      </div>

      {/* Slots */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 overflow-y-auto pr-1">
        {currentSlots.map((slot: Slot, idx: number) => (
          <button
            key={`${slot.start}-${slot.end}-${idx}`}
            onClick={() => onPick(slot)}
            className="rounded-lg border px-3 py-2 text-sm shadow-sm hover:shadow transition active:scale-[0.98] bg-background hover:bg-accent"
          >
            <div className="font-medium">
              {formatTime(slot.start)} – {formatTime(slot.end)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

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
