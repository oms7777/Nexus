// system/ai/tools/search.ts
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { createTool } from "@convex-dev/agent";
import { generateText } from "ai";
import z from "zod";
import { api, internal } from "../../../_generated/api";
import rag from "../rag";
import { SEARCH_INTERPRETER_PROMPT } from "../constants";

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

function getChatModel(provider?: string | null, model?: string | null) {
  const p = provider ?? "openai";
  const m = model ?? "gpt-4o-mini";
  return p === "google" ? google.chat(m) : openai.chat(m);
}

function isNoKbResult(searchText?: string | null) {
  return !searchText || searchText.trim().length < 50;
}

type KnowledgeMode = "llm_only" | "llm_plus_kb" | "kb_only";

export const search = createTool({
  description: "Search the knowledge base for relevant information to help answer user questions",
  args: z.object({
    query: z.string().describe("The search query to find relevant information"),
  }),
  handler: async (ctx, args) => {
    if (!ctx.threadId) return "Missing thread ID";

    // 1) conversation => orgId
    const conversation = await ctx.runQuery(
      internal.system.conversations.getByThreadId,
      { threadId: ctx.threadId },
    );
    if (!conversation) return "Conversation not found";

    const orgId = conversation.organizationId;

    // 2) widget settings (public)
    const widgetSettings = await ctx.runQuery(
      api.public.widgetSettings.getByOrganizationId,
      { organizationId: orgId },
    );

    const knowledgeMode =
      ((widgetSettings?.knowledgeMode as KnowledgeMode | undefined) ?? "llm_plus_kb");

    const model = getChatModel(
      (widgetSettings as any)?.llmProvider ?? "openai",
      (widgetSettings as any)?.llmModel ?? "gpt-4o-mini",
    );

    // 3) llm_only => LLM sans KB
    if (knowledgeMode === "llm_only") {
      const response = await generateText({
        model,
        messages: [
          { role: "system", content: NO_KB_PROMPT },
          { role: "user", content: args.query },
        ],
      });

      return response.text;
    }

    // 4) KB modes => RAG search
    const searchResult = await rag.search(ctx, {
      namespace: orgId,
      query: args.query,
      limit: 5,
    });

    // 5) Nothing found => standard message (NO DUMP)
    if (isNoKbResult(searchResult.text)) {
      return (
        `I couldn't find specific information about that in our knowledge base. ` +
        `Would you like me to connect you with a human support agent who can help?`
      );
    }

    // Build a context (INTERNAL) for the interpreter, but NEVER return it directly
    const sources = searchResult.entries
      .map((e) => e.title || null)
      .filter(Boolean)
      .join(", ");

    const contextText =
      `Sources: ${sources || "documents"}\n\n` +
      `${searchResult.text}`;

    // 6) kb_only => STILL return a clean answer (no context shown)
    // We use the interpreter prompt to force: only what is in KB, otherwise escalate.
    if (knowledgeMode === "kb_only") {
      const response = await generateText({
        model,
        messages: [
          { role: "system", content: SEARCH_INTERPRETER_PROMPT },
          {
            role: "user",
            content: `User asked: "${args.query}"\n\nSearch results:\n${contextText}`,
          },
        ],
      });

      return response.text;
    }

    // 7) llm_plus_kb => same as above (interpreted answer)
    const response = await generateText({
      model,
      messages: [
        { role: "system", content: SEARCH_INTERPRETER_PROMPT },
        {
          role: "user",
          content: `User asked: "${args.query}"\n\nSearch results:\n${contextText}`,
        },
      ],
    });

    return response.text;
  },
});
