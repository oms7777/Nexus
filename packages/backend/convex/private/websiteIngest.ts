import { ConvexError, v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import rag from "../system/ai/rag";

type WebsiteEntryMetadata = {
  kind?: "kb";
  folder?: string | null;
  sourceUrl: string;
  uploadedBy?: string;
};

const DEFAULT_MAX_PAGES = 20;
const HARD_MAX_PAGES = 60;

const SKIPPED_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".ico",
  ".pdf",
  ".zip",
  ".rar",
  ".7z",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
];

const SKIPPED_PATH_PATTERNS = [
  "/wp-content/",
  "/wp-includes/",
  "/static/",
  "/assets/",
  "/images/",
  "/img/",
  "/_next/",
  "/api/",
  "/admin",
  "/login",
];

/** User-Agent type navigateur pour éviter les blocages (403) par les sites / WAF */
const CRAWL_USER_AGENT =
  "Mozilla/5.0 (compatible; InboundlessBot/1.0; +https://inboundless.co)";

const JINA_READER_BASE = "https://r.jina.ai/";

function isSameHost(target: URL, root: URL): boolean {
  return target.host === root.host && target.protocol === root.protocol;
}

function shouldSkipPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();

  if (SKIPPED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  if (SKIPPED_PATH_PATTERNS.some((p) => lower.includes(p))) return true;

  return false;
}

function extractLinks(html: string, baseUrl: URL): string[] {
  const links = new Set<string>();

  const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;

    try {
      const url = new URL(href, baseUrl);
      if (!isSameHost(url, baseUrl)) continue;
      if (shouldSkipPath(url.pathname)) continue;
      links.add(url.toString());
    } catch {
      // ignore invalid URLs
    }
  }

  return Array.from(links);
}

function stripHtmlToText(html: string): { title: string; text: string } {
  // Remove script and style blocks
  let cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");

  // Extract <title>
  let title = "";
  const titleMatch = cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  }

  // Extract meta description and og:description for SPAs with little body content
  const metaDescMatch = cleaned.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
    || cleaned.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const ogDescMatch = cleaned.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i)
    || cleaned.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:description["']/i);
  const metaDesc = (metaDescMatch?.[1] || ogDescMatch?.[1] || "").trim();

  // Remove all tags
  let text = cleaned.replace(/<\/(p|div|section|article|br|li|h[1-6])>/gi, "$&\n");
  text = text.replace(/<[^>]+>/g, " ");

  // Decode a few common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Prepend title + meta description so SPAs with minimal body still get indexed
  const prefix = [title, metaDesc].filter(Boolean).join(" ");
  const combined = prefix ? (prefix + " " + text).trim() : text;

  return { title, text: combined };
}

async function fetchJinaText(url: string): Promise<string> {
  const readerUrl = `${JINA_READER_BASE}${url}`;
  const res = await fetch(readerUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": CRAWL_USER_AGENT,
      Accept: "text/plain",
    },
  });
  if (!res.ok) {
    throw new Error(`Jina returned ${res.status}`);
  }
  return await res.text();
}

async function purgeWebsiteEntries(ctx: any, organizationId: string) {
  const ns = await rag.getNamespace(ctx, { namespace: organizationId });
  if (!ns) return;

  let cursor: string | null = null;
  // best-effort: delete existing website entries so re-crawls don't bloat KB
  for (let i = 0; i < 50; i++) {
    const results = await rag.list(ctx, {
      namespaceId: ns.namespaceId,
      paginationOpts: { numItems: 200, cursor },
    });
    for (const entry of results.page) {
      const meta = entry.metadata as WebsiteEntryMetadata | undefined;
      const isWebsite = (meta?.folder ?? "") === "Website" || String(entry.key ?? "").includes("/website/");
      if (!isWebsite) continue;
      try {
        await rag.deleteAsync(ctx, { entryId: entry.entryId });
      } catch {
        // ignore
      }
    }
    if (results.isDone) break;
    cursor = results.continueCursor ?? null;
    if (!cursor) break;
  }
}

export const ingestPublicSite = action({
  args: {
    organizationId: v.string(),
    rootUrl: v.string(),
    maxPages: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, rootUrl, maxPages }) => {
    let root: URL;
    try {
      root = new URL(rootUrl);
    } catch {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Invalid URL" });
    }

    if (!["http:", "https:"].includes(root.protocol)) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "URL must use http or https",
      });
    }

    const limit = Math.max(
      1,
      Math.min(HARD_MAX_PAGES, Number.isFinite(maxPages || 0) ? (maxPages as number) : DEFAULT_MAX_PAGES),
    );

    // Subscription check – same rule as KB uploads
    const subscription = await ctx.runQuery(internal.system.subscriptions.getByOrganizationId, {
      organizationId,
    });

    if (subscription?.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Missing subscription" });
    }

    // ✅ Replace existing website entries on each run (keeps KB clean)
    await purgeWebsiteEntries(ctx, organizationId);

    const visited = new Set<string>();
    const queue: string[] = [root.toString()];

    let indexedCount = 0;
    const fetchOpts: RequestInit = {
      redirect: "follow",
      headers: { "User-Agent": CRAWL_USER_AGENT },
    };

    while (queue.length > 0 && visited.size < limit) {
      const currentUrl = queue.shift()!;
      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      const isRootPage = visited.size === 1;

      let response: Response;
      try {
        response = await fetch(currentUrl, fetchOpts);
      } catch (err) {
        if (isRootPage) {
          throw new ConvexError({
            code: "BAD_REQUEST",
            message:
              "Could not reach the site. It may be down, blocking automated access, or the URL may be wrong.",
          });
        }
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
        if (isRootPage) {
          const status = response.status;
          throw new ConvexError({
            code: "BAD_REQUEST",
            message:
              status === 403
                ? "Site returned 403 (access denied). Many sites block crawlers; try adding your content via PDF/TXT upload instead."
                : status === 404
                  ? "Page not found (404). Check the URL."
                  : `Site returned ${status}. Could not index.`,
          });
        }
        continue;
      }

      let html: string;
      try {
        html = await response.text();
      } catch {
        if (isRootPage) {
          throw new ConvexError({
            code: "BAD_REQUEST",
            message: "Could not read the page content.",
          });
        }
        continue;
      }

      const { title, text } = stripHtmlToText(html);

      const minLength = 80;
      let indexedText: string | null = null;

      // ✅ Prefer Jina Reader for indexing (better for SPAs / client-rendered pages)
      try {
        const jinaText = await fetchJinaText(currentUrl);
        if (jinaText && jinaText.trim().length >= minLength) {
          indexedText = jinaText.trim();
        }
      } catch {
        // fallback to SSR HTML text below
      }

      // Fallback: use stripped HTML (title + meta included)
      if (!indexedText && text && text.length >= minLength) {
        indexedText = text;
      }

      if (!indexedText) continue;

      const key = `${organizationId}/website/${Date.now()}-${indexedCount + 1}`;

      try {
        await rag.add(ctx, {
          namespace: organizationId,
          text: indexedText,
          key,
          title: title || root.host,
          metadata: {
            kind: "kb",
            folder: "Website",
            sourceUrl: currentUrl,
            uploadedBy: organizationId,
          } as WebsiteEntryMetadata,
        });

        indexedCount += 1;
      } catch {
        // ignore individual indexing failures
      }

      if (visited.size >= limit) break;

      const urlObj = new URL(currentUrl);
      const newLinks = extractLinks(html, urlObj).filter((link) => !visited.has(link));

      for (const link of newLinks) {
        if (queue.length + visited.size >= limit) break;
        queue.push(link);
      }
    }

    return {
      pagesVisited: visited.size,
      pagesIndexed: indexedCount,
      limit,
    };
  },
});

