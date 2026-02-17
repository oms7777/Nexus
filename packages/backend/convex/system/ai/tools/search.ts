// system/ai/tools/search.ts
import { createTool } from "@convex-dev/agent";
import z from "zod";
import { internal } from "../../../_generated/api";
import rag from "../rag";

// --- helpers ---
function clip(text: string, max = 1600) {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim() + "…";
}

// (optionnel) garde ton relevance guard si tu veux
function tokenize(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
const STOP = new Set([
  "the","a","an","and","or","to","of","in","on","for","with","is","are","was","were",
  "i","you","he","she","it","we","they","my","your","our","their",
  "can","could","should","would","how","what","when","where","why"
]);
function isRelevant(query: string, text: string) {
  const q = tokenize(query).filter(t => !STOP.has(t));
  if (q.length === 0) return false;
  const hay = (text || "").toLowerCase();
  const hits = q.filter(t => hay.includes(t));
  if (hits.length === 0) return false;
  return (hits.length / q.length) >= 0.25;
}

/**
 * ✅ searchTool = retrieval-only, NEVER throws.
 * - No widgetSettings read
 * - No llm call
 * - Always returns "NO_RESULT" or a clipped KB excerpt
 */
export const search = createTool({
  description: "Search the knowledge base for relevant information to help answer user questions",
  args: z.object({
    query: z.string().describe("The search query to find relevant information"),
  }),
  handler: async (ctx, args) => {
    try {
      if (!ctx.threadId) return "NO_RESULT";

      const conversation = await ctx.runQuery(
        internal.system.conversations.getByThreadId,
        { threadId: ctx.threadId }
      );
      if (!conversation) return "NO_RESULT";

      const orgId = conversation.organizationId;

      const searchResult = await rag.search(ctx, {
        namespace: orgId,
        query: args.query,
        limit: 5,
      });

      const raw = (searchResult?.text ?? "").trim();
      if (!raw) return "NO_RESULT";
      if (raw.length < 50) return "NO_RESULT";

      // optionnel (mais utile)
      if (!isRelevant(args.query, raw)) return "NO_RESULT";

      return clip(raw, 1600);
    } catch (err) {
      console.error("searchTool failed:", err);
      return "NO_RESULT"; // ✅ never break the agent
    }
  },
});
