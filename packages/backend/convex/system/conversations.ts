// packages/backend/convex/system/conversations.ts
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { api, internal } from "../_generated/api";

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

    const alreadyEscalated = conversation.status === "escalated";

    const now = Date.now();

    const assignment = await ctx.runMutation(api.routing.ensureAssignmentForSession, {
      organizationId: conversation.organizationId,
      contactSessionId: conversation.contactSessionId,
    });

    const assignedRepUserId: string | undefined =
      assignment.assignedRepUserId ?? conversation.assignedRepUserId ?? undefined;

    const assignedTerritoryKey: string | undefined =
      assignment.assignedTerritoryKey ?? conversation.assignedTerritoryKey ?? undefined;

    await ctx.db.patch(conversation._id, {
      status: "escalated",
      escalatedAt: (conversation as any).escalatedAt ?? now,
      updatedAt: now,
      assignedRepUserId,
      assignedTerritoryKey,
    });

    // belt & suspenders
    if (assignedRepUserId) {
      await ctx.db.patch(conversation.contactSessionId, {
        assignedRepUserId,
        assignedTerritoryKey,
      });
    }

    // Notify rep (Slack + email) once per conversation — first transition to escalated
    if (!alreadyEscalated) {
      await ctx.scheduler.runAfter(0, internal.private.leadNotify.sendEscalationDigest, {
        conversationId: conversation._id,
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