import { openai } from "@ai-sdk/openai";
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

export const search = createTool({
  description:
    "Search the knowledge base for relevant information to help answer user questions",
  args: z.object({
    query: z.string().describe("The search query to find relevant information"),
  }),
  handler: async (ctx, args) => {
    if (!ctx.threadId) {
      return "Missing thread ID";
    }

    // 1) Get conversation => orgId
    const conversation = await ctx.runQuery(
      internal.system.conversations.getByThreadId,
      { threadId: ctx.threadId },
    );

    if (!conversation) {
      return "Conversation not found";
    }

    const orgId = conversation.organizationId;

    // 2) Read widget settings for orgId (PUBLIC query)
    const widgetSettings = await ctx.runQuery(
      api.public.widgetSettings.getByOrganizationId,
      { organizationId: orgId },
    );

    const knowledgeMode = widgetSettings?.knowledgeMode ?? "llm_plus_kb";

    // 3) If KB disabled => no RAG, just LLM
    if (knowledgeMode === "llm_only") {
      const response = await generateText({
        model: openai.chat("gpt-4o-mini"),
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

    // 4) KB enabled => RAG search + interpretation
    const searchResult = await rag.search(ctx, {
      namespace: orgId,
      query: args.query,
      limit: 5,
    });

    const contextText = `Found results in ${searchResult.entries
      .map((e) => e.title || null)
      .filter((t) => t !== null)
      .join(", ")}. Here is the context:\n\n${searchResult.text}`;

    const response = await generateText({
      model: openai.chat("gpt-4o-mini"),
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
