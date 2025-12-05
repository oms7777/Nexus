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

  /* Loading */
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading availability…
      </div>
    );
  }

  /* No slots */
  if (!slots || slots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No availability found.
      </div>
    );
  }

  /* Process slots */
  const uniq: Slot[] = Array.from(
    new Map<string, Slot>(
      slots.map((s) => [`${s.start}-${s.end}`, s])
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

  return (
    <div className="w-full flex flex-col gap-3">

      {/* Header */}
      <div className="flex flex-col items-center text-center mb-2">
        <img
          src={rep.avatarUrl || ""}
          className="w-14 h-14 rounded-full object-cover mb-2"
        />

        <div className="text-base font-semibold">{rep.name}</div>

        <div className="text-xs text-muted-foreground">
          {[rep.title, rep.regions?.join(", ")].filter(Boolean).join(" • ")}
        </div>

        <button
          onClick={onBack}
          className="text-[11px] underline text-muted-foreground mt-2"
        >
          ← Change sales rep
        </button>
      </div>

      {/* Calendar Box */}
      <div className="bg-white border rounded-xl p-3 shadow-sm">

        {/* Days (Calendly style compact) */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
          {days.map((day, idx) => {
            const active = idx === safeIndex;
            const [weekday, ...rest] = day.split(" ");

            return (
              <button
                key={day}
                onClick={() => setActiveIndex(idx)}
                className={[
                  "min-w-[85px] rounded-full px-3 py-1.5 border text-left transition",
                  "flex flex-col justify-center",
                  active
                    ? "bg-primary text-white border-primary"
                    : "bg-white hover:bg-accent",
                ].join(" ")}
                style={{ fontSize: "11px" }}
              >
                <span className="uppercase text-[10px] font-medium tracking-wide">
                  {weekday}
                </span>
                <span className="text-[13px] font-semibold">{rest.join(" ")}</span>
              </button>
            );
          })}
        </div>

        {/* Slots (compact, like Calendly) */}
        <div className="grid grid-cols-2 gap-2">
          {currentSlots.map((slot, idx) => (
            <button
              key={`${slot.start}-${slot.end}-${idx}`}
              onClick={() => onPick(slot)}
              className="rounded-lg border px-3 py-2 text-xs shadow-sm 
                         hover:bg-primary hover:text-white transition"
              style={{ fontSize: "13px" }}
            >
              {formatTime(slot.start)} – {formatTime(slot.end)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Helpers */
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
