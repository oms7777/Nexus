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

function firstNonHostedPageFromList(pages: unknown[]): string | undefined {
  for (const p of pages) {
    if (typeof p !== "string" || !p.trim()) continue;
    const t = p.trim();
    if (!isHostedInboundlessAppUrl(t)) return t;
  }
  return undefined;
}

function isRootPathUrl(url: string): boolean {
  try {
    const p = (new URL(url).pathname || "/").replace(/\/$/, "") || "/";
    return p === "/";
  } catch {
    return false;
  }
}

function sameRegisteredHost(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname.replace(/^www\./i, "").toLowerCase();
    const hb = new URL(b).hostname.replace(/^www\./i, "").toLowerCase();
    return ha === hb;
  } catch {
    return false;
  }
}

/**
 * Live Map / list: which URL to show for "current page".
 *
 * Prefer **`metadata.currentUrl`** (same field as Conversations / last heartbeat) so the map does not
 * stick on a stale entry in `pages[]` when history and heartbeat briefly disagree.
 *
 * Exception: `currentUrl` can stay on site root "/" after SPA navigations while `pages` (newest-first)
 * already has a deeper path — then use the first non-widget page from `pages`.
 *
 * Snapshots / rrweb meta can still lag; they are used after session metadata.
 */
export function pickBestVisitorPageUrl(input: {
  metadata: Record<string, unknown>;
  snapshotPageUrl?: string;
}): string | undefined {
  const { metadata, snapshotPageUrl } = input;
  const pages = Array.isArray(metadata.pages) ? (metadata.pages as unknown[]) : [];
  const firstPage = firstNonHostedPageFromList(pages);

  let cur: string | undefined;
  const curRaw = metadata.currentUrl;
  if (typeof curRaw === "string" && curRaw.trim()) {
    const t = curRaw.trim();
    if (!isHostedInboundlessAppUrl(t)) cur = t;
  }

  if (cur) {
    const stuckOnRoot =
      firstPage &&
      isRootPathUrl(cur) &&
      sameRegisteredHost(cur, firstPage) &&
      !isRootPathUrl(firstPage);
    if (!stuckOnRoot) return cur;
  }

  if (firstPage) return firstPage;

  if (typeof snapshotPageUrl === "string" && snapshotPageUrl.trim()) {
    const t = snapshotPageUrl.trim();
    if (!isHostedInboundlessAppUrl(t)) return t;
  }

  const ref = metadata.referrer;
  if (typeof ref === "string" && ref.trim()) {
    const t = ref.trim();
    if (!isHostedInboundlessAppUrl(t)) return t;
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
