import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const saveAiLeadSummary = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    markdown: v.string(),
  },
  handler: async (ctx, { conversationId, markdown }) => {
    await ctx.db.patch(conversationId, {
      aiLeadSummary: markdown,
      aiLeadSummaryAt: Date.now(),
    });
  },
});
