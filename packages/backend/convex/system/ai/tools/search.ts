import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { createTool } from "@convex-dev/agent";
import { generateText } from "ai";
import z from "zod";
import { api, internal } from "../../../_generated/api";
import { supportAgent } from "../agents/supportAgent";
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

  if (p === "google") {
    // Exemple: "gemini-1.5-flash" / "gemini-1.5-pro"
    return google.chat(m);
  }

  // OpenAI default
  return openai.chat(m);
}

function isNoKbResult(searchText?: string | null) {
  return !searchText || searchText.trim().length < 50;
}

export const search = createTool({
  description:
    "Search the knowledge base for relevant information to help answer user questions",
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
      (widgetSettings?.knowledgeMode as
        | "llm_only"
        | "llm_plus_kb"
        | "kb_only"
        | undefined) ?? "llm_plus_kb";

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

      await supportAgent.saveMessage(ctx, {
        threadId: ctx.threadId,
        message: { role: "assistant", content: response.text },
      });

      return response.text;
    }

    // 4) KB modes => RAG search
    const searchResult = await rag.search(ctx, {
      namespace: orgId,
      query: args.query,
      limit: 5,
    });

    // Si rien trouvé
    if (isNoKbResult(searchResult.text)) {
      const msg =
        `I couldn't find specific information about that in our knowledge base. ` +
        `Would you like me to connect you with a human support agent who can help?`;

      await supportAgent.saveMessage(ctx, {
        threadId: ctx.threadId,
        message: { role: "assistant", content: msg },
      });

      return msg;
    }

    // 5) kb_only => on NE GÉNÈRE PAS avec un LLM (on renvoie “contexte” brut interprétable)
    // 👉 IMPORTANT: ton SUPPORT_AGENT_PROMPT dit "Only use info from search results".
    // Donc on peut renvoyer un “answer draft” très sobre, ou bien juste un extrait.
    if (knowledgeMode === "kb_only") {
      const sources = searchResult.entries
        .map((e) => e.title || null)
        .filter(Boolean)
        .join(", ");

      const msg =
        `Here is what I found in our knowledge base (${sources || "documents"}):\n\n` +
        searchResult.text;

      await supportAgent.saveMessage(ctx, {
        threadId: ctx.threadId,
        message: { role: "assistant", content: msg },
      });

      return msg;
    }

    // 6) llm_plus_kb => LLM interprète les résultats
    const contextText = `Found results in ${searchResult.entries
      .map((e) => e.title || null)
      .filter((t) => t !== null)
      .join(", ")}. Here is the context:\n\n${searchResult.text}`;

    const response = await generateText({
      model,
      messages: [
        { role: "system", content: SEARCH_INTERPRETER_PROMPT },
        {
          role: "user",
          content: `User asked: "${args.query}"\n\nSearch results: ${contextText}`,
        },
      ],
    });

    await supportAgent.saveMessage(ctx, {
      threadId: ctx.threadId,
      message: { role: "assistant", content: response.text },
    });

    return response.text;
  },
});
