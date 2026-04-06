/**
 * KB strict mode used to describe a fallback via <<<FALLBACK>>>...<<<END_FALLBACK>>> in prompts.
 * Models sometimes echo those markers — strip them so visitors never see internal delimiters.
 */
export function sanitizeVisitorAssistantText(raw: string): string {
  const t = (raw ?? "").trim();
  const fenced = /<<<FALLBACK>>>\s*([\s\S]*?)\s*<<<END_FALLBACK>>>/i.exec(t);
  if (fenced) return fenced[1].trim();
  return t.replace(/<<<FALLBACK>>>/gi, "").replace(/<<<END_FALLBACK>>>/gi, "").trim();
}
