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

  // Fix common bug: "text-plain" -> "text/plain"
  if (safe && safe.includes("-") && !safe.includes("/")) {
    safe = safe.replace("-", "/");
  }

  // SVG often arrives as text/plain or empty
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

type EntryMetadata = {
  storageId: Id<"_storage">;
  uploadedBy: string;
  filename: string;

  /**
   * ✅ System category:
   * - "kb" => indexed & shown in KB page
   * - "brand_logo" / "avatar" => assets only (not indexed, not shown in KB)
   */
  category: "kb" | "brand_logo" | "avatar";

  /**
   * ✅ Optional UI folder for KB classification (Pricing, Support, etc.)
   * Only meaningful when category === "kb"
   */
  folder?: string | null;
};

export type PublicFile = {
  id: EntryId;
  name: string;
  type: string;
  size: string;
  status: "ready" | "processing" | "error";
  url: string | null;

  // For UI display
  category?: string;
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

export const addFile = action({
  args: {
    filename: v.string(),
    mimeType: v.string(),
    bytes: v.bytes(),

    /**
     * ✅ category is SYSTEM category:
     * - omitted => KB upload by default
     * - "brand_logo" / "avatar" => assets only (no indexing)
     */
    category: v.optional(v.union(v.literal("brand_logo"), v.literal("avatar"), v.literal("kb"))),

    /**
     * ✅ folder is for KB classification only (optional)
     * ex: "Pricing", "Support", "Sales"
     */
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

    // ✅ subscription check only required for KB indexing
    const wantedCategory = (args.category ?? "kb") as "kb" | "brand_logo" | "avatar";

    if (wantedCategory === "kb") {
      const subscription = await ctx.runQuery(
        internal.system.subscriptions.getByOrganizationId,
        { organizationId: orgId },
      );

      if (subscription?.status !== "active") {
        throw new ConvexError({ code: "BAD_REQUEST", message: "Missing subscription" });
      }
    }

    const { bytes, filename } = args;
    const safeMimeType = sanitizeMimeType(args.mimeType, filename, bytes);

    const blob = new Blob([bytes], { type: safeMimeType });
    const storageId = await ctx.storage.store(blob);

    // ✅ ASSET MODE (logo/avatar): store only, return stable URL, no RAG indexing
    if (wantedCategory === "brand_logo" || wantedCategory === "avatar") {
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

    // ✅ KB MODE: extract text + index in RAG
    const text = await extractTextContent(ctx, {
      storageId,
      filename,
      bytes,
      mimeType: safeMimeType,
    });

    const folder = (args.folder ?? "").trim() || null;

    const { entryId, created } = await rag.add(ctx, {
      namespace: orgId,
      text,
      key: filename,
      title: filename,
      metadata: {
        storageId,
        uploadedBy: orgId,
        filename,
        category: "kb",
        folder,
      } as EntryMetadata,
      contentHash: await contentHashFromArrayBuffer(bytes),
    });

    // If duplicate content, clean storage
    if (!created) {
      await ctx.storage.delete(storageId);
    }

    const url = await ctx.storage.getUrl(storageId);

    return { url, entryId, storageId };
  },
});

/* ----------------------------- Queries ----------------------------- */

export const list = query({
  args: {
    category: v.optional(v.string()), // usually "kb"
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
      results.page.map((entry) => convertEntryToPublicFile(ctx, entry)),
    );

    // ✅ KB page should only show KB docs (never assets)
    const filteredFiles = files.filter((file) => {
      const cat = file.category;

      // Always hide assets from KB list
      if (cat === "brand_logo" || cat === "avatar") return false;

      if (args.category) {
        return cat === args.category;
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

async function convertEntryToPublicFile(ctx: QueryCtx, entry: Entry): Promise<PublicFile> {
  const metadata = entry.metadata as EntryMetadata | undefined;
  const storageId = metadata?.storageId;

  let fileSize = "unknown";

  if (storageId) {
    try {
      const storageMetadata = await ctx.db.system.get(storageId);
      if (storageMetadata) {
        fileSize = formatFileSize(storageMetadata.size);
      }
    } catch {
      // ignore
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
    category: metadata?.category || undefined,
    folder: metadata?.folder || undefined,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}
