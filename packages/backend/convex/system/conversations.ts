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
    const prevEscalatedAt = (conversation as any).escalatedAt as number | undefined;
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
      // ✅ always bump escalatedAt so the conversation becomes "unseen" again if it was viewed long ago
      escalatedAt: now,
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

    // Notify rep (Slack + email) on first escalation, OR if re-escalated after a long time.
    // This avoids spam loops while still surfacing "visitor came back after days".
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const shouldNotify =
      !alreadyEscalated || (typeof prevEscalatedAt === "number" && now - prevEscalatedAt > THREE_DAYS_MS);

    if (shouldNotify) {
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