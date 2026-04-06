/**
 * KB strict mode used to describe a fallback via <<<FALLBACK>>>...<<<END_FALLBACK>>> in prompts.
 * Models sometimes echo those markers — strip them so visitors never see internal delimiters.
 */
export function sanitizeVisitorAssistantText(raw: string): string {
  const t = (raw ?? "").trim();
  const fenced = /<<<FALLBACK>>>\s*([\s\S]*?)\s*<<<END_FALLBACK>>>/i.exec(t);
  const inner = fenced?.[1];
  if (inner != null) return inner.trim();
  return t.replace(/<<<FALLBACK>>>/gi, "").replace(/<<<END_FALLBACK>>>/gi, "").trim();
}
