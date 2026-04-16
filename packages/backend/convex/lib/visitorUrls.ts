/**
 * Dashboard display: session.metadata.currentUrl is sometimes the widget iframe URL.
 * Prefer the first non-hosted URL among currentUrl, pages[], and referrer.
 */

export function isHostedInboundlessAppUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "widget.inboundless.co" || h === "app.inboundless.co";
  } catch {
    return false;
  }
}

export function bestPageUrlFromSessionMetadata(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  if (!metadata) return undefined;
  const candidates: string[] = [];
  const push = (s: unknown) => {
    if (typeof s === "string" && s.trim()) candidates.push(s.trim());
  };
  push(metadata.currentUrl);
  const pages = metadata.pages;
  if (Array.isArray(pages)) {
    for (const p of pages) {
      if (typeof p === "string") push(p);
    }
  }
  push(metadata.referrer);
  for (const c of candidates) {
    if (!isHostedInboundlessAppUrl(c)) return c;
  }
  return undefined;
}

/** Return metadata safe for inbox/detail UI (never misleading widget-only currentUrl). */
export function sanitizeSessionMetadataForDisplay(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const best = bestPageUrlFromSessionMetadata(metadata);
  const cur = metadata.currentUrl;
  if (typeof cur === "string" && isHostedInboundlessAppUrl(cur)) {
    if (best) return { ...metadata, currentUrl: best };
    const { currentUrl: _drop, ...rest } = metadata;
    return { ...rest };
  }
  return metadata;
}
