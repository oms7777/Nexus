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

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div className="h-2 w-24 animate-pulse rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--widget-primary) 25%, transparent)" }} />
        <p className="text-xs text-muted-foreground">Loading availability…</p>
      </div>
    );
  }

  if (!slots || slots.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border p-6" style={{ borderColor: "color-mix(in srgb, var(--widget-primary) 20%, transparent)", backgroundColor: "color-mix(in srgb, var(--widget-primary) 8%, transparent)" }}>
        <p className="text-sm font-medium text-foreground">No availability</p>
        <p className="text-xs text-muted-foreground">Try another period or contact us.</p>
      </div>
    );
  }

  const uniq: Slot[] = Array.from(
    new Map<string, Slot>(slots.map((s: Slot) => [`${s.start}-${s.end}`, s])).values()
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
    <div className="flex h-full w-full flex-col gap-4">
      <div className="text-center">
        <h3 className="text-sm font-semibold text-foreground">Pick a time</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Times in your local timezone
        </p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
        {days.map((day, idx) => {
          const active = idx === safeIndex;
          const [weekday, ...rest] = day.split(" ");
          return (
            <button
              key={day}
              onClick={() => setActiveIndex(idx)}
              className={[
                "min-w-[88px] rounded-xl px-3 py-2 text-left text-xs transition",
                "flex flex-col justify-center border",
                active ? "shadow-sm" : "bg-white text-foreground",
              ].join(" ")}
              style={
                active
                  ? { backgroundColor: "var(--widget-primary)", color: "var(--widget-primary-text)", borderColor: "var(--widget-primary)" }
                  : { borderColor: "color-mix(in srgb, var(--widget-primary) 20%, transparent)" }
              }
            >
              <span className="uppercase tracking-wide opacity-90">{weekday}</span>
              <span className="font-semibold">{rest.join(" ")}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {currentSlots.map((slot, idx) => (
          <button
            key={`${slot.start}-${slot.end}-${idx}`}
            onClick={() => onPick(slot)}
            className="rounded-xl border bg-white px-3 py-2.5 text-xs font-medium transition active:scale-[0.98]"
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
            {formatTime(slot.start)} – {formatTime(slot.end)}
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
