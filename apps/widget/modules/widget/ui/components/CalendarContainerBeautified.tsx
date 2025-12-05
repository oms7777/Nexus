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

  /* ---------------- LOADING / EMPTY ---------------- */
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

  /* ---------------- PREP SLOTS SAFELY ---------------- */

  // Deduplicate
  const uniq: Slot[] = Array.from(
    new Map<string, Slot>(
      slots.map((s: Slot) => [`${s.start}-${s.end}`, s])
    ).values()
  );

  // Group by day
  const grouped: Record<string, Slot[]> = {};
  uniq.forEach((s: Slot) => {
    const d = formatDay(s.start);
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(s);
  });

  const days: string[] = Object.keys(grouped);

  // Avoid undefined
  const safeIndex = Math.min(activeIndex, days.length - 1);

  const currentDay: string = days[safeIndex] ?? "";
  const currentSlots: Slot[] = grouped[currentDay] ?? [];

  /* ---------------- UI ---------------- */

  return (
    <div className="w-full flex flex-col gap-4">

      {/* HEADER — Sales info like Calendly */}
      <div className="flex items-center gap-3">
        <img
          src={rep.avatarUrl || ""}
          className="w-12 h-12 rounded-full object-cover bg-muted"
        />
        <div className="flex flex-col">
          <span className="font-semibold text-base">{rep.name}</span>
          <span className="text-xs text-muted-foreground">
            {[rep.title, rep.regions?.join(", ")].filter(Boolean).join(" • ")}
          </span>
          <span className="text-[11px] text-muted-foreground mt-1">
            Your timezone:{" "}
            {new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).format(
              new Date()
            )}
          </span>
        </div>
      </div>

      {/* BACK BUTTON */}
      <button
        onClick={onBack}
        className="text-xs underline text-muted-foreground w-fit"
      >
        ← Change sales rep
      </button>

      {/* CALENDAR CARD */}
      <div className="bg-white rounded-lg border shadow-sm p-4">

        {/* DAYS */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
          {days.map((day: string, idx: number) => {
            const [weekday, ...rest] = day.split(" ");
            const active = idx === safeIndex;

            return (
              <button
                key={day}
                onClick={() => setActiveIndex(idx)}
                className={[
                  "min-w-[95px] rounded-full px-3 py-2 border text-left transition",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-white hover:bg-accent",
                ].join(" ")}
              >
                <div className="uppercase text-[11px] tracking-wide font-medium">
                  {weekday}
                </div>
                <div className="text-sm font-semibold">{rest.join(" ")}</div>
              </button>
            );
          })}
        </div>

        {/* SLOTS */}
        <div className="grid grid-cols-2 gap-2">
          {currentSlots.map((slot: Slot, idx: number) => (
            <button
              key={`${slot.start}-${slot.end}-${idx}`}
              onClick={() => onPick(slot)}
              className="rounded-lg border px-3 py-2 bg-white hover:bg-primary hover:text-primary-foreground shadow-sm transition text-sm"
            >
              {formatTime(slot.start)} – {formatTime(slot.end)}
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
