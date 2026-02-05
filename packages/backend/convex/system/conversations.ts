// packages/backend/convex/system/conversations.ts
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

export const escalate = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique();

    if (!conversation) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Conversation not found" });
    }

    const now = Date.now();

    // ✅ If no assigned rep yet, pick the first AVAILABLE rep
    let assignedRepUserId = conversation.assignedRepUserId ?? null;

    if (!assignedRepUserId) {
      const available =
        (await ctx.runQuery(internal.system.repsPresence.listAvailableForOrg, {
          organizationId: conversation.organizationId,
        })) ?? [];

      assignedRepUserId = available?.[0]?.userId ?? null;
    }

    await ctx.db.patch(conversation._id, {
      status: "escalated",
      escalatedAt: (conversation as any).escalatedAt ?? now, // keep first escalatedAt
      updatedAt: now,
      ...(assignedRepUserId ? { assignedRepUserId } : {}),
    });

    // ✅ Optional but recommended: also persist assignment on the session for stability
    if (assignedRepUserId) {
      await ctx.db.patch(conversation.contactSessionId, {
        assignedRepUserId,
        assignedTerritoryKey: conversation.assignedTerritoryKey ?? undefined,
      });
    }
  },

});

export const resolve = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique();

    if (!conversation) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Conversation not found" });
    }

    await ctx.db.patch(conversation._id, { status: "resolved" });
  },
});

export const getByThreadId = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique();
  },
});
