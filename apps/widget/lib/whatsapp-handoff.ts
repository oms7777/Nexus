/**
 * WhatsApp handoff via https://wa.me — no Meta API keys.
 * Phone must be digits only with country code (e.g. 33612345678).
 */

import type { WidgetUiLanguage } from "./widget-chat-i18n";

export function stripToWhatsAppDigits(input: string): string {
  return input.replace(/\D/g, "");
}

export function isPlausibleWhatsAppDigits(digits: string): boolean {
  return digits.length >= 8 && digits.length <= 15;
}

/** True when the current URL is the embedded widget (not the visitor’s site). */
export function isLikelyEmbeddedWidgetPage(href: string): boolean {
  try {
    const u = new URL(href);
    if (u.searchParams.has("organizationId")) return true;
    const host = u.hostname.toLowerCase();
    if (host === "widget.inboundless.co") return true;
    if (host.startsWith("widget.") && host.endsWith(".inboundless.co")) return true;
    return false;
  } catch {
    return false;
  }
}

/** Short, human-readable page label — never includes sensitive query strings. */
export function shortPageLabelFromUrl(href: string, maxLen = 200): string {
  const u = new URL(href);
  const path = u.pathname === "/" ? "" : u.pathname;
  let s = `${u.hostname.replace(/^www\./i, "")}${path}`;
  if (s.length > maxLen) s = `${s.slice(0, Math.max(0, maxLen - 1))}…`;
  return s;
}

/**
 * Visitor-facing label for “where” the chat came from.
 * On the widget host, prefers `document.referrer` (the real site); otherwise a generic line.
 */
export function buildVisitorPageLabel(
  locationHref: string,
  documentReferrer: string,
  lang: WidgetUiLanguage
): string {
  const generic = lang === "fr" ? "le site" : "the website";

  if (!locationHref.trim()) return generic;

  try {
    if (!isLikelyEmbeddedWidgetPage(locationHref)) {
      return shortPageLabelFromUrl(locationHref);
    }
  } catch {
    return generic;
  }

  const ref = (documentReferrer ?? "").trim();
  if (!ref) return generic;

  try {
    if (isLikelyEmbeddedWidgetPage(ref)) return generic;
    return shortPageLabelFromUrl(ref);
  } catch {
    return generic;
  }
}

export type WhatsAppPrefillFillContext = {
  /** Back-compat: same value as `pageLabel` (no raw widget URLs with org IDs). */
  pageUrl: string;
  pageLabel: string;
  locale: string;
  chatExcerpt: string;
};

export function fillWhatsAppTemplate(template: string, ctx: WhatsAppPrefillFillContext): string {
  let s = template
    .replace(/\{pageUrl\}/g, ctx.pageLabel)
    .replace(/\{pageLabel\}/g, ctx.pageLabel)
    .replace(/\{locale\}/g, ctx.locale)
    .replace(/\{chatExcerpt\}/g, ctx.chatExcerpt);
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

const DEFAULT_SIMPLE: Record<WidgetUiLanguage, string> = {
  en: "Hi! I'm messaging from the website chat (context: {pageLabel}).",
  fr: "Bonjour, je vous contacte depuis le chat du site (contexte : {pageLabel}).",
};

const DEFAULT_WITH_EXCERPT: Record<WidgetUiLanguage, string> = {
  en:
    "Hi! I'm messaging from the website chat.\n\nRecent conversation:\n{chatExcerpt}\n\nPage context: {pageLabel}",
  fr:
    "Bonjour, je vous contacte depuis le chat du site.\n\nRésumé de la conversation :\n{chatExcerpt}\n\nContexte : {pageLabel}",
};

export function buildChatExcerptForWhatsApp(
  msgs: Array<{ role: string; text: string }>,
  maxTotal: number,
  lang: WidgetUiLanguage
): string {
  const userLabel = lang === "fr" ? "Visiteur" : "Visitor";
  const botLabel = lang === "fr" ? "Assistant" : "Assistant";
  const lines: string[] = [];
  const tail = msgs.slice(-10);
  for (const m of tail) {
    const raw = (m.text ?? "").replace(/\s+/g, " ").trim();
    if (!raw) continue;
    const label = m.role === "user" ? userLabel : botLabel;
    const chunk = raw.length > 220 ? `${raw.slice(0, 217)}…` : raw;
    lines.push(`${label}: ${chunk}`);
  }
  let out = lines.join("\n");
  if (out.length > maxTotal) {
    out = `${out.slice(0, Math.max(0, maxTotal - 1))}…`;
  }
  return out;
}

export type WhatsAppPrefillInput = {
  locationHref: string;
  documentReferrer: string;
  chatExcerpt?: string;
};

export function resolveWhatsAppPrefill(
  template: string | undefined | null,
  lang: WidgetUiLanguage,
  input: WhatsAppPrefillInput
): string {
  const raw = (template ?? "").trim();
  const excerpt = (input.chatExcerpt ?? "").trim();
  const pageLabel = buildVisitorPageLabel(input.locationHref, input.documentReferrer, lang);

  const base =
    raw ||
    (excerpt.length > 0 ? DEFAULT_WITH_EXCERPT[lang] : DEFAULT_SIMPLE[lang]);

  const fillCtx: WhatsAppPrefillFillContext = {
    pageUrl: pageLabel,
    pageLabel,
    locale: lang,
    chatExcerpt: excerpt,
  };

  return fillWhatsAppTemplate(base, fillCtx);
}

export function buildWhatsAppHandoffUrl(digits: string, prefilledMessage: string): string {
  const d = stripToWhatsAppDigits(digits);
  const base = `https://wa.me/${d}`;
  const text = prefilledMessage.trim();
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}
