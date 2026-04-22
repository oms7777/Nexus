"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Paperclip, X } from "lucide-react";
import type { PlaybookAnswer, PlaybookStep } from "../../../../lib/playbook-presets";
import type { WidgetUiCopy, WidgetUiLanguage } from "../../../../lib/widget-chat-i18n";
import { cn } from "@workspace/ui/lib/utils";

type Props = {
  steps: PlaybookStep[];
  uiLang: WidgetUiLanguage;
  t: WidgetUiCopy;
  primaryBg: string;
  primaryFg: string;
  onComplete: (answers: Record<string, PlaybookAnswer>) => void;
  onSkip: () => void;
  className?: string;
};

export default function PlaybookPanel({
  steps,
  uiLang,
  t,
  primaryBg,
  primaryFg,
  onComplete,
  onSkip,
  className,
}: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, PlaybookAnswer>>({});
  const [otherDraft, setOtherDraft] = useState("");
  const [showOther, setShowOther] = useState(false);

  const total = steps.length;
  const boundedIndex = total > 0 ? Math.min(Math.max(0, stepIndex), total - 1) : 0;
  const step = steps[boundedIndex];

  const labels = useMemo(() => {
    const pick = (o: { en: string; fr: string }) => (uiLang === "fr" ? o.fr : o.en);
    if (!step) return { q: "", opts: [] as { id: string; label: string }[] };
    return {
      q: pick(step.question),
      opts: step.options.map((o) => ({ id: o.id, label: pick(o.label) })),
    };
  }, [step, uiLang]);

  const commitStepAndAdvance = (answer: PlaybookAnswer) => {
    const current = steps[stepIndex];
    if (!current) return;
    const nextAnswers = { ...answers, [current.id]: answer };
    setAnswers(nextAnswers);
    setOtherDraft("");
    setShowOther(false);

    if (stepIndex >= total - 1) {
      onComplete(nextAnswers);
      return;
    }
    setStepIndex((i) => Math.min(i + 1, total - 1));
  };

  const pickOption = (optionId: string, label: string) => {
    commitStepAndAdvance({ kind: "option", optionId, label });
  };

  const submitOther = () => {
    const text = otherDraft.trim();
    if (!text.length) return;
    commitStepAndAdvance({ kind: "custom", text });
  };

  if (!step || total === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto z-30 mx-auto w-full max-w-[380px] rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.35)]",
        className,
      )}
      role="dialog"
      aria-labelledby="playbook-question"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 id="playbook-question" className="flex-1 text-[15px] font-semibold leading-snug text-slate-900">
          {labels.q}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={t.playbookPrevAria}
            disabled={stepIndex <= 0}
            onClick={() => {
              if (stepIndex <= 0) return;
              const nextIdx = stepIndex - 1;
              const keepIds = new Set(steps.slice(0, nextIdx + 1).map((s) => s.id));
              setAnswers((prev) =>
                Object.fromEntries(
                  Object.entries(prev).filter(([id]) => keepIds.has(id)),
                ),
              );
              setStepIndex(nextIdx);
              setShowOther(false);
              setOtherDraft("");
            }}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-[11px] font-medium tabular-nums text-slate-500">
            {stepIndex + 1} / {total}
          </span>
          <button
            type="button"
            aria-label={t.playbookCloseAria}
            onClick={onSkip}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {labels.opts.map((o, idx) => {
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => pickOption(o.id, o.label)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium transition",
                "border-slate-200/80 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
                {idx + 1}
              </span>
              <span className="min-w-0 flex-1">{o.label}</span>
              <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
            </button>
          );
        })}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        {!showOther ? (
          <button
            type="button"
            onClick={() => setShowOther(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-left text-[12px] text-slate-600 hover:bg-slate-50"
          >
            <Paperclip className="size-3.5 opacity-70" aria-hidden />
            {t.playbookOtherLabel}
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              value={otherDraft}
              onChange={(e) => setOtherDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitOther();
                }
              }}
              placeholder={t.playbookOtherPlaceholder}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none ring-[var(--widget-primary)] focus:ring-2"
              autoFocus
            />
            <button
              type="button"
              style={{ backgroundColor: primaryBg, color: primaryFg }}
              className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-semibold disabled:opacity-40"
              disabled={!otherDraft.trim()}
              onClick={submitOther}
            >
              OK
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <button type="button" onClick={onSkip} className="text-[12px] font-medium text-slate-500 hover:text-slate-800">
          {t.playbookSkip}
        </button>
      </div>
    </div>
  );
}
