import { ConvexError, v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import rag from "../system/ai/rag";

type WebsiteEntryMetadata = {
  kind?: "kb";
  folder?: string | null;
  sourceUrl: string;
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

  return { title, text };
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

    const visited = new Set<string>();
    const queue: string[] = [root.toString()];

    let indexedCount = 0;

    while (queue.length > 0 && visited.size < limit) {
      const currentUrl = queue.shift()!;
      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      let response: Response;
      try {
        response = await fetch(currentUrl, { redirect: "follow" as any });
      } catch {
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
        continue;
      }

      let html: string;
      try {
        html = await response.text();
      } catch {
        continue;
      }

      const { title, text } = stripHtmlToText(html);

      // Skip tiny / empty pages
      if (!text || text.length < 400) {
        continue;
      }

      const key = `${organizationId}/website/${Date.now()}-${indexedCount + 1}`;

      try {
        await rag.add(ctx, {
          namespace: organizationId,
          text,
          key,
          title: title || root.host,
          metadata: {
            kind: "kb",
            folder: "Website",
            sourceUrl: currentUrl,
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

