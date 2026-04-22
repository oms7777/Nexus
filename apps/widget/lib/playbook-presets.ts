import type { WidgetUiLanguage } from "./widget-chat-i18n";

export type PlaybookOption = {
  id: string;
  label: { en: string; fr: string };
};

export type PlaybookStep = {
  id: string;
  question: { en: string; fr: string };
  options: PlaybookOption[];
};

const BOOK_DEMO_QUAL: PlaybookStep[] = [
  {
    id: "role",
    question: {
      en: "What’s your role?",
      fr: "Quel est ton rôle ?",
    },
    options: [
      { id: "founder", label: { en: "Founder / Co-founder", fr: "Fondateur / Co-fondateur" } },
      { id: "dev", label: { en: "Engineering / CTO", fr: "Dev / CTO" } },
      { id: "mkt", label: { en: "Marketing / Growth", fr: "Marketing / Growth" } },
      { id: "other", label: { en: "Other", fr: "Autre" } },
    ],
  },
  {
    id: "priority",
    question: {
      en: "What do you want to improve first?",
      fr: "Qu’est-ce que tu veux améliorer en priorité ?",
    },
    options: [
      { id: "positioning", label: { en: "Positioning / messaging", fr: "Le positionnement / messaging" } },
      { id: "pricing", label: { en: "Pricing & offer", fr: "Le pricing et l’offre" } },
      { id: "ux", label: { en: "Design & UX", fr: "Le design et l’UX" } },
      { id: "compete", label: { en: "Features vs competitors", fr: "Les fonctionnalités vs concurrents" } },
    ],
  },
  {
    id: "stage",
    question: {
      en: "What’s your current stage?",
      fr: "Quel est ton stade actuel ?",
    },
    options: [
      { id: "pre", label: { en: "Pre-launch", fr: "Pré-lancement" } },
      { id: "early", label: { en: "A few customers", fr: "Quelques clients" } },
      { id: "growth", label: { en: "Actively growing", fr: "En croissance active" } },
      { id: "scale", label: { en: "Raising / scaling", fr: "Cherche à lever / scaler" } },
    ],
  },
];

export function getPlaybookSteps(presetId: string | undefined | null): PlaybookStep[] | null {
  if (presetId === "book_demo_qual_v1") return BOOK_DEMO_QUAL;
  return null;
}

export type PlaybookAnswer =
  | { kind: "option"; optionId: string; label: string }
  | { kind: "custom"; text: string };

export function formatPlaybookSummaryMarkdown(
  steps: PlaybookStep[],
  answers: Record<string, PlaybookAnswer>,
  lang: WidgetUiLanguage,
): string {
  const qPrefix = lang === "fr" ? "Q :" : "Q:";
  const rPrefix = lang === "fr" ? "R :" : "R:";
  const intro =
    lang === "fr"
      ? "Merci — voici ce que vous avez indiqué :\n\n"
      : "Thanks — here’s what you shared:\n\n";

  const lines: string[] = [intro];

  for (const step of steps) {
    const a = answers[step.id];
    if (!a) continue;
    const q = lang === "fr" ? step.question.fr : step.question.en;
    const r = a.kind === "option" ? a.label : a.text.trim();
    lines.push(`${qPrefix} ${q}`);
    lines.push(`${rPrefix} ${r}`);
    lines.push("");
  }

  const outro =
    lang === "fr"
      ? "Je m’appuie sur ces éléments pour vous répondre au mieux."
      : "I’ll use this context to tailor my answers.";

  return lines.join("\n").trimEnd() + `\n\n${outro}`;
}
