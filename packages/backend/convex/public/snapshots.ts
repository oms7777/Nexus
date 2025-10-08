// packages/backend/convex/public/snapshots.ts
import { action, mutation } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { query } from "../_generated/server";

/** Mutation: insère la ligne dans la table */
export const insertRow = mutation({
  args: {
    organizationId: v.string(),
    sessionId: v.id("contactSessions"),
    ts: v.number(),
    pageUrl: v.optional(v.string()),
    title: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sessionSnapshots", args);
    return { ok: true };
  },
});

/** Action: reçoit le dataURL, le stocke en blob, puis appelle la mutation ci-dessus */
export const save = action({
  args: {
    organizationId: v.string(),
    sessionId: v.id("contactSessions"),
    ts: v.number(),
    pageUrl: v.optional(v.string()),
    title: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    // ex: "data:image/webp;base64,AAAA..."
    dataUrl: v.string(),
  },
  handler: async (ctx, args) => {
    // Décoder le dataURL -> Blob
    const [prefix, base64] = (args.dataUrl || "").split(",");
    if (!base64) throw new Error("BAD_DATA_URL");
    const mime = /^data:(.+);base64$/i.exec(prefix || "")?.[1] ?? "image/webp";

    const bytes = Buffer.from(base64, "base64"); // Uint8Array compatible
    const blob = new Blob([bytes], { type: mime });

    // Stocker le blob
    const storageId = await ctx.storage.store(blob);

    // Écrire en base via une mutation
    await ctx.runMutation(api.public.snapshots.insertRow, {
      organizationId: args.organizationId,
      sessionId: args.sessionId,
      ts: args.ts,
      pageUrl: args.pageUrl,
      title: args.title,
      width: args.width,
      height: args.height,
      storageId,
    });

    return { ok: true, storageId };
  },
});

export const listRecent = query({
  args: {
    sessionId: v.id("contactSessions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, limit }) => {
    const rows = await ctx.db
      .query("sessionSnapshots")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(limit ?? 12);

    const withUrls = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        url: await ctx.storage.getUrl(r.storageId),
      }))
    );

    return withUrls;
  },
});
