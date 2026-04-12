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

export function fillWhatsAppTemplate(
  template: string,
  ctx: { pageUrl: string; locale: string }
): string {
  return template
    .replace(/\{pageUrl\}/g, ctx.pageUrl)
    .replace(/\{locale\}/g, ctx.locale);
}

const DEFAULT_PREFILL: Record<WidgetUiLanguage, string> = {
  en: "Hi! I'm messaging from the website chat. Page: {pageUrl}",
  fr: "Bonjour, je vous contacte depuis le chat du site. Page : {pageUrl}",
};

export function resolveWhatsAppPrefill(
  template: string | undefined | null,
  lang: WidgetUiLanguage,
  ctx: { pageUrl: string }
): string {
  const raw = (template ?? "").trim();
  const base = raw || DEFAULT_PREFILL[lang];
  return fillWhatsAppTemplate(base, { pageUrl: ctx.pageUrl, locale: lang });
}

export function buildWhatsAppHandoffUrl(digits: string, prefilledMessage: string): string {
  const d = stripToWhatsAppDigits(digits);
  const base = `https://wa.me/${d}`;
  const text = prefilledMessage.trim();
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}
