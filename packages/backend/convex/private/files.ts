// packages/backend/convex/private/files.ts

import { ConvexError, v } from "convex/values";
import {
  contentHashFromArrayBuffer,
  Entry,
  EntryId,
  guessMimeTypeFromContents,
  guessMimeTypeFromExtension,
  vEntryId,
} from "@convex-dev/rag";
import { action, mutation, query, QueryCtx } from "../_generated/server";
import { extractTextContent } from "../lib/extractTextContent";
import { requireOrgManager } from "../lib/authz";
import rag from "../system/ai/rag";
import { Id } from "../_generated/dataModel";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../_generated/api";

/* ----------------------------- Helpers ----------------------------- */

function guessMimeType(filename: string, bytes: ArrayBuffer): string {
  return (
    guessMimeTypeFromExtension(filename) ||
    guessMimeTypeFromContents(bytes) ||
    "application/octet-stream"
  );
}

function sanitizeMimeType(
  mime: string | undefined,
  filename: string,
  bytes: ArrayBuffer,
): string {
  const name = (filename || "").toLowerCase();
  let safe = (mime || "").trim();

  // sometimes we receive "application-pdf" instead of "application/pdf"
  if (safe && safe.includes("-") && !safe.includes("/")) {
    safe = safe.replace("-", "/");
  }

  if (name.endsWith(".svg")) return "image/svg+xml";

  if (!safe || !safe.includes("/")) {
    safe = guessMimeType(filename, bytes);
  }

  return safe;
}

function buildStorageFallbackUrl(storageId: Id<"_storage">): string | null {
  const deployment = process.env.CONVEX_DEPLOYMENT;
  if (!deployment) return null;
  return `https://${deployment}.convex.cloud/api/storage/${storageId}`;
}

function safeFileTypeFromName(name: string): string {
  const n = (name || "").trim();
  const ext = n.includes(".") ? n.split(".").pop()?.toLowerCase() : "";
  return ext && ext.length <= 8 ? ext : "file";
}

/* ----------------------------- Types ----------------------------- */

type SystemKind = "kb" | "brand_logo" | "avatar" | "promo_media";

const MAX_PROMO_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PROMO_VIDEO_BYTES = 50 * 1024 * 1024;

function isMp4Magic(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 12) return false;
  const v = new Uint8Array(bytes);
  // ISO BMFF: size (4) + "ftyp" (4) at offset 4
  return v[4] === 0x66 && v[5] === 0x74 && v[6] === 0x79 && v[7] === 0x70;
}

/** Browsers often send video/mp4 as empty type or application/octet-stream — normalize before validation. */
function normalizePromoVideoMime(filename: string, mime: string, bytes: ArrayBuffer): string {
  const m = (mime || "").trim().toLowerCase();
  if (m.startsWith("video/")) return mime.trim();
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  if (ext === "ogv" || ext === "ogg") return "video/ogg";
  if (isMp4Magic(bytes)) return "video/mp4";
  return mime.trim();
}

function assertPromoMediaMime(
  role: "image" | "video",
  mime: string,
): void {
  const m = (mime || "").toLowerCase();
  if (role === "video") {
    if (!m.startsWith("video/")) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Video uploads must be a video file (e.g. MP4, WebM).",
      });
    }
    return;
  }
  if (!m.startsWith("image/")) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Image uploads must be an image file (e.g. PNG, WebP, JPEG).",
    });
  }
}

function assertPromoMediaSize(role: "image" | "video", byteLength: number): void {
  const max = role === "video" ? MAX_PROMO_VIDEO_BYTES : MAX_PROMO_IMAGE_BYTES;
  if (byteLength > max) {
    const mb = max / (1024 * 1024);
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: `File too large (max ${mb}MB for ${role === "video" ? "video" : "image"}).`,
    });
  }
}

type EntryMetadata = {
  storageId: Id<"_storage">;
  uploadedBy: string;
  filename: string;

  /**
   * ✅ system kind:
   * - kb: indexed and listed on /files
   * - brand_logo/avatar/promo_media: assets only (not indexed, not listed)
   *
   * NOTE: old data might have used `category` for folder. We keep backward compatibility.
   */
  kind?: SystemKind;

  /**
   * ✅ folder = user classification for KB (“Presentation”, “Support”…)
   * Old version stored folder into `category`. We still read it.
   */
  folder?: string | null;

  /**
   * Old field (folder in the old version)
   */
  category?: string | null;
};

export type PublicFile = {
  id: EntryId;
  name: string;
  type: string;
  size: string;
  status: "ready" | "processing" | "error";
  url: string | null;
  kind?: SystemKind;
  folder?: string;
};

/* ----------------------------- Mutations ----------------------------- */

export const deleteFile = mutation({
  args: { entryId: vEntryId },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgManager(ctx);

    const namespace = await rag.getNamespace(ctx, { namespace: orgId });
    if (!namespace) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid namespace" });
    }

    const entry = await rag.getEntry(ctx, { entryId: args.entryId });
    if (!entry) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Entry not found" });
    }

    const meta = entry.metadata as EntryMetadata | undefined;
    if (meta?.uploadedBy !== orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid Organization ID" });
    }

    if (meta?.storageId) {
      await ctx.storage.delete(meta.storageId as Id<"_storage">);
    }

    await rag.deleteAsync(ctx, { entryId: args.entryId });
  },
});

/* ----------------------------- Actions ----------------------------- */

/**
 * ✅ Backward compatible:
 * - old UI sends `category: "Presentation"` -> treated as folder (KB)
 * - old UI sends `category: "brand_logo"` -> treated as asset kind
 *
 * ✅ New UI should send:
 * - kind: "kb" + folder?: "Presentation"
 * - kind: "brand_logo" or "avatar"
 */
export const addFile = action({
  args: {
    filename: v.string(),
    mimeType: v.string(),
    bytes: v.bytes(),

    // old param (string). We keep it to avoid breaking existing UI.
    category: v.optional(v.string()),

    // new param (system kind)
    kind: v.optional(
      v.union(
        v.literal("kb"),
        v.literal("brand_logo"),
        v.literal("avatar"),
        v.literal("promo_media"),
      ),
    ),

    /** Required when kind is promo_media: which promo field the file fills */
    promoMediaRole: v.optional(
      v.union(v.literal("image"), v.literal("video")),
    ),

    // new param (folder)
    folder: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgManager(ctx);

    // ✅ Resolve kind (system) with backward compatibility
    const legacyCategory = (args.category ?? "").trim();
    let kind: SystemKind = (args.kind ?? "kb") as SystemKind;

    if (!args.kind && legacyCategory) {
      // legacy behavior:
      // - brand_logo/avatar => system kind
      // - anything else => folder (kb)
      if (legacyCategory === "brand_logo") kind = "brand_logo";
      else if (legacyCategory === "avatar") kind = "avatar";
      else if (legacyCategory === "promo_media") kind = "promo_media";
      else kind = "kb";
    }

    // ✅ subscription check only required for KB indexing
    if (kind === "kb") {
      const subscription = await ctx.runQuery(
        internal.system.subscriptions.getByOrganizationId,
        { organizationId: orgId },
      );

      const status = subscription?.status as string | undefined;
      if (status !== "active" && status !== "trial") {
        throw new ConvexError({ code: "BAD_REQUEST", message: "Missing subscription" });
      }
    }

    const bytes = args.bytes;
    const filename = args.filename?.trim() || "document";
    let safeMimeType = sanitizeMimeType(args.mimeType, filename, bytes);

    if (kind === "promo_media") {
      const role = args.promoMediaRole;
      if (!role) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: "promoMediaRole is required for promo media uploads (image or video).",
        });
      }
      if (role === "video") {
        safeMimeType = normalizePromoVideoMime(filename, safeMimeType, bytes);
      }
      assertPromoMediaSize(role, bytes.byteLength);
      assertPromoMediaMime(role, safeMimeType);
    }

    const blob = new Blob([bytes], { type: safeMimeType });
    const storageId = await ctx.storage.store(blob);

    // ✅ Assets: store only, return URL
    if (kind === "brand_logo" || kind === "avatar" || kind === "promo_media") {
      const urlFromConvex = await ctx.storage.getUrl(storageId);
      const url = urlFromConvex ?? buildStorageFallbackUrl(storageId);

      if (!url) {
        throw new ConvexError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate URL for uploaded asset",
        });
      }

      return { url, storageId };
    }

    // ✅ KB folder (new folder > legacy category > null)
    const folder =
      (args.folder?.trim() || "") ||
      (legacyCategory && legacyCategory !== "kb" ? legacyCategory : "") ||
      "";

    const text = await extractTextContent(ctx, {
      storageId,
      filename,
      bytes,
      mimeType: safeMimeType,
    });

    const contentHash = await contentHashFromArrayBuffer(bytes);

    /**
     * ✅ IMPORTANT:
     * Always make key unique so uploads don't silently dedupe/hide.
     */
    const uniqueKey = `${orgId}/kb/${Date.now()}-${filename}`;

    const { entryId } = await rag.add(ctx, {
      namespace: orgId,
      text,
      key: uniqueKey,
      title: filename,
      metadata: {
        storageId,
        uploadedBy: orgId,
        filename,
        kind: "kb",
        folder: folder || null,
      } as EntryMetadata,
      contentHash,
    });

    const urlFromConvex = await ctx.storage.getUrl(storageId);
    const url = urlFromConvex ?? buildStorageFallbackUrl(storageId);

    return { url, entryId, storageId };
  },
});

/* ----------------------------- Crawl site (KB) ----------------------------- */

export const crawlSite = action({
  args: {
    rootUrl: v.string(),
    maxPages: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ pagesVisited: number; pagesIndexed: number; limit: number }> => {
    const { orgId } = await requireOrgManager(ctx);

    return await ctx.runAction(
      (internal as any)["private/websiteIngest"].ingestPublicSite,
      {
        organizationId: orgId,
        rootUrl: args.rootUrl,
        maxPages: args.maxPages,
      }
    );
  },
});

/* ----------------------------- Queries ----------------------------- */

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    refreshToken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgManager(ctx);

    const namespace = await rag.getNamespace(ctx, { namespace: orgId });
    if (!namespace) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const results = await rag.list(ctx, {
      namespaceId: namespace.namespaceId,
      paginationOpts: args.paginationOpts,
    });

    const mapped = await Promise.all(
      results.page.map((entry) => convertEntryToPublicFile(ctx, entry)),
    );

    // ✅ Only KB docs in /files. Hide assets completely.
    const filtered = mapped.filter((f) => (f.kind ?? "kb") === "kb");

    return {
      page: filtered,
      isDone: results.isDone,
      continueCursor: results.continueCursor,
    };
  },
});

/* ----------------------------- Mappers ----------------------------- */

async function convertEntryToPublicFile(ctx: QueryCtx, entry: Entry): Promise<PublicFile> {
  const metadata = entry.metadata as EntryMetadata | undefined;
  const storageId = metadata?.storageId;

  let fileSize = "unknown";
  if (storageId) {
    try {
      const storageMetadata = await ctx.db.system.get(storageId);
      if (storageMetadata) fileSize = formatFileSize(storageMetadata.size);
    } catch {
      // ignore
    }
  }

  const displayName =
    (entry.title as string | undefined) ||
    metadata?.filename ||
    entry.key ||
    "Unknown";

  const type = safeFileTypeFromName(displayName);

  let status: "ready" | "processing" | "error" = "error";
  if (entry.status === "ready") status = "ready";
  else if (entry.status === "pending") status = "processing";

  let url: string | null = null;
  if (storageId) {
    const urlFromConvex = await ctx.storage.getUrl(storageId);
    url = urlFromConvex ?? buildStorageFallbackUrl(storageId);
  }

  // ✅ kind + folder (compat with old `category`)
  const kind = (metadata?.kind as SystemKind | undefined) ?? "kb";
  const folder = (metadata?.folder ?? metadata?.category ?? "") || undefined;

  return {
    id: entry.entryId,
    name: displayName,
    type,
    size: fileSize,
    status,
    url,
    kind,
    folder,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}
