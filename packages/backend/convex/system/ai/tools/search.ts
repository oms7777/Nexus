// system/ai/tools/search.ts
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { createTool } from "@convex-dev/agent";
import { generateText } from "ai";
import z from "zod";
import { api, internal } from "../../../_generated/api";
import rag from "../rag";

const NO_KB_PROMPT = `
# Support Assistant – No Knowledge Base

You are a friendly support assistant.
The company has chosen to disable its internal knowledge base for now.

- Answer using only general reasoning and what the user tells you.
- Do NOT invent specific prices, plan names, contract terms, or internal policies.
- If the user asks for information you can't reliably know without internal docs,
  say you don't have access to that and suggest speaking with a human.
- Keep answers concise and helpful.
`;

// ---------- model routing ----------
function getChatModel(provider?: string | null, model?: string | null) {
  const p = provider ?? "openai";
  const m = (model ?? "").trim() || (p === "google" ? "gemini-1.5-pro" : "gpt-4o-mini");
  return p === "google" ? google.chat(m) : openai.chat(m);
}

// ---------- relevance guard (simple but effective) ----------
function tokenize(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// petit filtre stopwords pour éviter les faux positifs
const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "is", "are", "was", "were",
  "i", "you", "he", "she", "it", "we", "they", "my", "your", "our", "their",
  "can", "could", "should", "would", "how", "what", "when", "where", "why"
]);

function isRelevant(query: string, text: string) {
  const q = tokenize(query).filter(t => !STOP.has(t));
  if (q.length === 0) return false;

  const hay = (text || "").toLowerCase();

  // au moins 1 mot “fort” du query doit exister dans le contexte
  const hits = q.filter(t => hay.includes(t));
  if (hits.length === 0) return false;

  // ratio minimal pour éviter “un mot random match”
  const ratio = hits.length / q.length;
  return ratio >= 0.25; // tu peux ajuster (0.2–0.35)
}

function clip(text: string, max = 1600) {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim() + "…";
}

/**
 * IMPORTANT:
 * - This tool must NOT save messages to the thread.
 * - It only returns data to the agent.
 *
 * ✅ CHANGE (MAJ):
 * - In llm_plus_kb mode, this tool is now RETRIEVAL-ONLY (no second LLM call inside the tool).
 * - The agent will do the final synthesis using its own prompt rules.
 */
export const search = createTool({
  description: "Search the knowledge base for relevant information to help answer user questions",
  args: z.object({
    query: z.string().describe("The search query to find relevant information"),
  }),
  handler: async (ctx, args) => {
    if (!ctx.threadId) return "NO_RESULT";

    // 1) conversation => orgId
    const conversation = await ctx.runQuery(
      internal.system.conversations.getByThreadId,
      { threadId: ctx.threadId },
    );
    if (!conversation) return "NO_RESULT";

    const orgId = conversation.organizationId;

    // 2) widget settings (public)
    const widgetSettings = await ctx.runQuery(
      api.public.widgetSettings.getByOrganizationId,
      { organizationId: orgId },
    );

    const knowledgeMode =
      (widgetSettings?.knowledgeMode as "llm_only" | "llm_plus_kb" | "kb_only" | undefined) ??
      "llm_plus_kb";

    const model = getChatModel(
      (widgetSettings as any)?.llmProvider ?? "openai",
      (widgetSettings as any)?.llmModel ?? "gpt-4o-mini",
    );

    // 3) llm_only => answer without KB (still: tool returns answer, agent can reuse)
    if (knowledgeMode === "llm_only") {
      const response = await generateText({
        model,
        messages: [
          { role: "system", content: NO_KB_PROMPT },
          { role: "user", content: args.query },
        ],
      });
      // IMPORTANT: no saveMessage here
      return response.text;
    }

    // 4) KB search
    const searchResult = await rag.search(ctx, {
      namespace: orgId,
      query: args.query,
      limit: 5,
    });

    const raw = (searchResult?.text ?? "").trim();
    if (!raw) return "NO_RESULT";
    if (raw.length < 50) return "NO_RESULT";

    // ✅ relevance guard (prevents “get married” matching inboundless docs)
    if (!isRelevant(args.query, raw)) {
      return "NO_RESULT";
    }

    // 5) kb_only => return ONLY a clipped KB excerpt (NO filenames, NO sources)
    if (knowledgeMode === "kb_only") {
      return clip(raw, 1400);
    }

    // ✅ 6) llm_plus_kb => RETRIEVAL ONLY (NO LLM INTERPRETER HERE)
    // The agent will rewrite/summarize using its own system prompt.
    return clip(raw, 1600);
  },
});
