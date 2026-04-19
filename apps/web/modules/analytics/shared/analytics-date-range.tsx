"use client";

import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { differenceInCalendarDays, endOfDay, startOfDay, subDays } from "date-fns";
import { CalendarRange } from "lucide-react";

import { Calendar } from "@workspace/ui/components/calendar";
import { Button } from "@workspace/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";

import { PALETTE } from "./analytics-primitives";

export type AnalyticsRange =
  | { kind: "preset"; days: 7 | 30 | 90 }
  | { kind: "custom"; fromTs: number; toTs: number };

const MAX_CUSTOM_DAYS = 366;

/** Same semantics as legacy `makeRange(days)` for presets: rolling window ending now. */
export function rangeToTimestamps(r: AnalyticsRange): { fromTs: number; toTs: number } {
  if (r.kind === "preset") {
    const toTs = Date.now();
    const fromTs = toTs - r.days * 24 * 60 * 60 * 1000;
    return { fromTs, toTs };
  }
  return { fromTs: r.fromTs, toTs: r.toTs };
}

function formatCustomLabel(fromTs: number, toTs: number) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const a = new Date(fromTs).toLocaleDateString(undefined, opts);
  const b = new Date(toTs).toLocaleDateString(undefined, { ...opts, year: "numeric" });
  return `${a} – ${b}`;
}

export function AnalyticsDateRangePicker({
  value,
  onChange,
}: {
  value: AnalyticsRange;
  onChange: (r: AnalyticsRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();

  const presetActive = value.kind === "preset" ? value.days : null;

  useEffect(() => {
    if (!open) return;
    if (value.kind === "custom") {
      setDraft({ from: new Date(value.fromTs), to: new Date(value.toTs) });
    } else {
      setDraft({ from: subDays(new Date(), 29), to: new Date() });
    }
  }, [open, value]);

  const applyCustom = () => {
    if (!draft?.from || !draft?.to) return;
    let fromD = startOfDay(draft.from);
    let toD = endOfDay(draft.to);
    if (fromD.getTime() > toD.getTime()) {
      const t = fromD;
      fromD = startOfDay(draft.to);
      toD = endOfDay(t);
    }
    const span = differenceInCalendarDays(toD, fromD) + 1;
    if (span > MAX_CUSTOM_DAYS) {
      fromD = startOfDay(subDays(toD, MAX_CUSTOM_DAYS - 1));
    }
    onChange({ kind: "custom", fromTs: fromD.getTime(), toTs: toD.getTime() });
    setOpen(false);
  };

  const customButtonLabel =
    value.kind === "custom" ? formatCustomLabel(value.fromTs, value.toTs) : "Custom range";

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
      <div className="inline-flex flex-wrap items-center justify-end gap-1 rounded-xl border bg-white p-1 shadow-sm dark:bg-card">
        {([7, 30, 90] as const).map((d) => {
          const active = value.kind === "preset" && presetActive === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange({ kind: "preset", days: d })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                active
                  ? `${PALETTE.gradient} text-white shadow-sm`
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              {d}d
            </button>
          );
        })}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                value.kind === "custom"
                  ? `${PALETTE.gradient} text-white shadow-sm`
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <CalendarRange className="size-3.5 opacity-90" aria-hidden />
              {customButtonLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              numberOfMonths={2}
              className="p-2"
              selected={draft}
              onSelect={setDraft}
              disabled={(date) => date > new Date() || date < new Date(Date.now() - 730 * 86400000)}
            />
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Max {MAX_CUSTOM_DAYS} days</p>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={applyCustom} disabled={!draft?.from || !draft?.to}>
                  Apply
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
