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

/**
 * Sanitize/normalize MIME types coming from the browser.
 * Fixes common bad values like "text-plain" and handles SVG properly.
 */
function sanitizeMimeType(
  mime: string | undefined,
  filename: string,
  bytes: ArrayBuffer,
): string {
  const name = (filename || "").toLowerCase();

  let safe = (mime || "").trim();

  // Very common mistake: "text-plain" instead of "text/plain"
  if (safe && safe.includes("-") && !safe.includes("/")) {
    safe = safe.replace("-", "/");
  }

  // SVG often arrives as text/plain or empty
  if (name.endsWith(".svg")) return "image/svg+xml";

  // If still invalid, guess from filename / contents
  if (!safe || !safe.includes("/")) {
    safe = guessMimeType(filename, bytes);
  }

  return safe;
}

/**
 * Best-effort URL: prefer ctx.storage.getUrl, fallback to a direct Convex storage path.
 */
function buildStorageFallbackUrl(storageId: Id<"_storage">): string | null {
  const deployment = process.env.CONVEX_DEPLOYMENT;
  if (!deployment) return null;
  return `https://${deployment}.convex.cloud/api/storage/${storageId}`;
}

/* ----------------------------- Types ----------------------------- */

type EntryMetadata = {
  storageId: Id<"_storage">;
  uploadedBy: string;
  filename: string;

  /**
   * ✅ INTERNAL TYPE (do not use for customer classification)
   * Examples: "kb", "brand_logo"
   */
  category: string;

  /**
   * ✅ CUSTOMER CLASSIFICATION (folder/grouping for KB)
   * Examples: "Sales", "Support", "Pricing"
   */
  kbCategory?: string;
};

export type PublicFile = {
  id: EntryId;
  name: string;
  type: string;
  size: string;
  status: "ready" | "processing" | "error";
  url: string | null;

  // internal kind
  category?: string;

  // customer folder/category
  kbCategory?: string;
};

/* ----------------------------- Mutations ----------------------------- */

export const deleteFile = mutation({
  args: {
    entryId: vEntryId,
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
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid namespace" });
    }

    const entry = await rag.getEntry(ctx, { entryId: args.entryId });
    if (!entry) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Entry not found" });
    }

    if ((entry.metadata as any)?.uploadedBy !== orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid Organization ID" });
    }

    const meta = entry.metadata as EntryMetadata | undefined;
    if (meta?.storageId) {
      await ctx.storage.delete(meta.storageId as Id<"_storage">);
    }

    await rag.deleteAsync(ctx, { entryId: args.entryId });
  },
});

/* ----------------------------- Actions ----------------------------- */

export const addFile = action({
  args: {
    filename: v.string(),
    mimeType: v.string(),
    bytes: v.bytes(),

    /**
     * ✅ INTERNAL TYPE ONLY
     * Examples: "kb", "brand_logo"
     */
    category: v.optional(v.string()),

    /**
     * ✅ Customer folder/classification for KB docs
     * (ignored for brand_logo)
     */
    kbCategory: v.optional(v.string()),
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

    const subscription = await ctx.runQuery(
      internal.system.subscriptions.getByOrganizationId,
      { organizationId: orgId },
    );

    if (subscription?.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Missing subscription" });
    }

    const { bytes, filename } = args;

    // ✅ INTERNAL TYPE: default to "kb"
    const internalCategory = (args.category ?? "kb").trim() || "kb";

    // ✅ Sanitize MIME to avoid "text-plain" and other invalid values
    const safeMimeType = sanitizeMimeType(args.mimeType, filename, bytes);

    const blob = new Blob([bytes], { type: safeMimeType });
    const storageId = await ctx.storage.store(blob);

    /**
     * ✅ brand_logo: do not index in RAG
     * only return a stable URL for UI usage.
     */
    if (internalCategory === "brand_logo") {
      const urlFromConvex = await ctx.storage.getUrl(storageId);
      const url = urlFromConvex ?? buildStorageFallbackUrl(storageId);

      if (!url) {
        throw new ConvexError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate URL for uploaded logo",
        });
      }

      return { url, storageId };
    }

    // ---- KB/RAG normal flow
    const text = await extractTextContent(ctx, {
      storageId,
      filename,
      bytes,
      mimeType: safeMimeType,
    });

    const { entryId, created } = await rag.add(ctx, {
      namespace: orgId,
      text,
      key: filename,
      title: filename,
      metadata: {
        storageId,
        uploadedBy: orgId,
        filename,

        // ✅ internal kind
        category: internalCategory,

        // ✅ customer classification (only meaningful for kb)
        kbCategory: args.kbCategory?.trim() || undefined,
      } as EntryMetadata,
      contentHash: await contentHashFromArrayBuffer(bytes),
    });

    if (!created) {
      console.debug("entry already exists, skipping upload metadata");
      await ctx.storage.delete(storageId);
    }

    const url = await ctx.storage.getUrl(storageId);

    return { url, entryId, storageId };
  },
});

/* ----------------------------- Queries ----------------------------- */

export const list = query({
  args: {
    /**
     * ✅ Filter by INTERNAL category (type)
     * Example: { category: "kb" } to list KB docs
     */
    category: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
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
      results.page.map((entry) => converEntryToPublicFile(ctx, entry)),
    );

    const filteredFiles = files.filter((file) => {
      // Always hide brand logos from KB view
      if (file.category === "brand_logo") return false;

      if (args.category) {
        return file.category === args.category;
      }

      return true;
    });

    return {
      page: filteredFiles,
      isDone: results.isDone,
      continueCursor: results.continueCursor,
    };
  },
});

/* ----------------------------- Mappers ----------------------------- */

async function converEntryToPublicFile(
  ctx: QueryCtx,
  entry: Entry,
): Promise<PublicFile> {
  const metadata = entry.metadata as EntryMetadata | undefined;
  const storageId = metadata?.storageId;

  let fileSize = "unknown";

  if (storageId) {
    try {
      const storageMetadata = await ctx.db.system.get(storageId);
      if (storageMetadata) {
        fileSize = formatFileSize(storageMetadata.size);
      }
    } catch (error) {
      console.error("Failed to get storage metadata: ", error);
    }
  }

  const filename = entry.key || "Unknown";
  const extension = filename.split(".").pop()?.toLowerCase() || "txt";

  let status: "ready" | "processing" | "error" = "error";
  if (entry.status === "ready") status = "ready";
  else if (entry.status === "pending") status = "processing";

  const url = storageId ? await ctx.storage.getUrl(storageId) : null;

  return {
    id: entry.entryId,
    name: filename,
    type: extension,
    size: fileSize,
    status,
    url,

    // internal kind
    category: metadata?.category,

    // customer folder
    kbCategory: metadata?.kbCategory,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"]; // ✅ fix typo MG -> MB
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}
