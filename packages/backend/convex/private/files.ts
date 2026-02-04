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

/* ----------------------------- Types ----------------------------- */

type SystemKind = "kb" | "brand_logo" | "avatar";

type EntryMetadata = {
  storageId: Id<"_storage">;
  uploadedBy: string;
  filename: string;

  /**
   * ✅ system kind:
   * - kb: indexed and listed on /files
   * - brand_logo/avatar: assets only (not indexed, not listed)
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
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });
    }

    const orgId = identity.orgId as string;
    if (!orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
    }

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
    kind: v.optional(v.union(v.literal("kb"), v.literal("brand_logo"), v.literal("avatar"))),

    // new param (folder)
    folder: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });
    }

    const orgId = identity.orgId as string;
    if (!orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
    }

    // ✅ Resolve kind (system) with backward compatibility
    const legacyCategory = (args.category ?? "").trim();
    let kind: SystemKind = (args.kind ?? "kb") as SystemKind;

    if (!args.kind && legacyCategory) {
      // legacy behavior:
      // - brand_logo/avatar => system kind
      // - anything else => folder (kb)
      if (legacyCategory === "brand_logo") kind = "brand_logo";
      else if (legacyCategory === "avatar") kind = "avatar";
      else kind = "kb";
    }

    // ✅ subscription check only required for KB indexing
    if (kind === "kb") {
      const subscription = await ctx.runQuery(
        internal.system.subscriptions.getByOrganizationId,
        { organizationId: orgId },
      );

      if (subscription?.status !== "active") {
        throw new ConvexError({ code: "BAD_REQUEST", message: "Missing subscription" });
      }
    }

    const bytes = args.bytes;
    const filename = args.filename?.trim() || "document";
    const safeMimeType = sanitizeMimeType(args.mimeType, filename, bytes);

    const blob = new Blob([bytes], { type: safeMimeType });
    const storageId = await ctx.storage.store(blob);

    // ✅ Assets: store only, return URL
    if (kind === "brand_logo" || kind === "avatar") {
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
     * ✅ IMPORTANT (same as your old "critical fix"):
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

    const url = await ctx.storage.getUrl(storageId);

    return { url, entryId, storageId };
  },
});

/* ----------------------------- Queries ----------------------------- */

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    refreshToken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });
    }

    const orgId = identity.orgId as string;
    if (!orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
    }

    const namespace = await rag.getNamespace(ctx, { namespace: orgId });
    if (!namespace) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const results = await rag.list(ctx, {
      namespaceId: namespace.namespaceId,
      paginationOpts: args.paginationOpts,
    });

    const files = await Promise.all(
      results.page.map((entry) => convertEntryToPublicFile(ctx, entry)),
    );

    /**
     * ✅ Only KB docs in /files.
     * Hide assets completely.
     */
    const filtered = files.filter((f) => {
      const kind = f.kind ?? "kb";
      return kind === "kb";
    });

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

  const extension =
    displayName.split(".").pop()?.toLowerCase() ||
    (entry.key?.split(".").pop()?.toLowerCase() ?? "txt");

  let status: "ready" | "processing" | "error" = "error";
  if (entry.status === "ready") status = "ready";
  else if (entry.status === "pending") status = "processing";

  const url = storageId ? await ctx.storage.getUrl(storageId) : null;

  // ✅ kind + folder (compat with old `category`)
  const kind = (metadata?.kind as SystemKind | undefined) ?? "kb";
  const folder = (metadata?.folder ?? metadata?.category ?? "") || undefined;

  return {
    id: entry.entryId,
    name: displayName,
    type: extension,
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
