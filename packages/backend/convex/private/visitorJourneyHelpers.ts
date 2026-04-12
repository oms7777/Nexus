import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const listSnapshotsForSession = internalQuery({
  args: { contactSessionId: v.id("contactSessions") },
  handler: async (ctx, { contactSessionId }) => {
    return await ctx.db
      .query("sessionSnapshots")
      .withIndex("by_session", (q) => q.eq("sessionId", contactSessionId))
      .order("asc")
      .take(100);
  },
});

export const getConversationAiFields = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const c = await ctx.db.get(conversationId);
    if (!c) return null;
    return {
      aiLeadSummary: (c as { aiLeadSummary?: string }).aiLeadSummary,
      aiLeadSummaryAt: (c as { aiLeadSummaryAt?: number }).aiLeadSummaryAt,
    };
  },
});
