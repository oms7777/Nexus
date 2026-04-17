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
  // `pages` is newest-first (see live upsertHeartbeat addPage). Prefer it over
  // `currentUrl`, which can stay stuck on "/" after SPA navigations.
  const pages = metadata.pages;
  if (Array.isArray(pages)) {
    for (const p of pages) {
      if (typeof p === "string") push(p);
    }
  }
  push(metadata.currentUrl);
  push(metadata.referrer);
  for (const c of candidates) {
    if (!isHostedInboundlessAppUrl(c)) return c;
  }
  return undefined;
}

/**
 * Snapshot rrweb often lags SPA navigations (meta href still "/"). Session heartbeats + `pages`
 * can carry "/pricing" or "/resources". Prefer the URL with a longer path on the same host.
 */
export function preferMoreSpecificPageUrl(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const ha = ua.hostname.replace(/^www\./i, "").toLowerCase();
    const hb = ub.hostname.replace(/^www\./i, "").toLowerCase();
    if (ha !== hb) return b;
    const pa = ua.pathname.replace(/\/$/, "") || "/";
    const pb = ub.pathname.replace(/\/$/, "") || "/";
    if (pb.length > pa.length) return b;
    if (pa.length > pb.length) return a;
    return b;
  } catch {
    return b ?? a;
  }
}

/** Same site + path + search — ignores www and trailing slash differences (SPA / heartbeat noise). */
export function normalizeVisitorUrlKey(url?: string): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const path = (u.pathname || "/").replace(/\/$/, "") || "/";
    return `${host}${path}${u.search}`;
  } catch {
    return undefined;
  }
}

/**
 * Live Map / inbox: merge snapshot + heartbeat history. Snapshot alone can lag on "/" while
 * heartbeats have /resources in `pages` — reduce all sources and pick the most specific path.
 */
export function pickBestVisitorPageUrl(input: {
  metadata: Record<string, unknown>;
  snapshotPageUrl?: string;
}): string | undefined {
  const { metadata, snapshotPageUrl } = input;
  const candidates: string[] = [];
  const push = (s: unknown) => {
    if (typeof s !== "string" || !s.trim()) return;
    const t = s.trim();
    if (!isHostedInboundlessAppUrl(t)) candidates.push(t);
  };
  if (snapshotPageUrl) push(snapshotPageUrl);
  const pages = Array.isArray(metadata.pages) ? metadata.pages : [];
  for (const p of pages) push(p);
  push(metadata.currentUrl);
  push(metadata.referrer);

  let best: string | undefined;
  for (const c of candidates) {
    best = preferMoreSpecificPageUrl(best, c) ?? c;
  }
  return best;
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
