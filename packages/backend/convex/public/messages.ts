// packages/backend/convex/public/messages.ts
import { ConvexError, v } from "convex/values";
import { action, query } from "../_generated/server";
import { components, internal, api } from "../_generated/api";
import { makeSupportAgent } from "../system/ai/agents/supportAgent";
import { paginationOptsValidator } from "convex/server";
import { escalateConversation } from "../system/ai/tools/escalateConversation";
import { resolveConversation } from "../system/ai/tools/resolveConversation";
import { saveMessage } from "@convex-dev/agent";
import { search } from "../system/ai/tools/search";
import rag from "../system/ai/rag";

type KnowledgeMode = "llm_only" | "llm_plus_kb" | "kb_only";

function isNoKbResult(searchText?: string | null) {
  return !searchText || searchText.trim().length < 50;
}

const KB_ONLY_FALLBACK =
  "I couldn't find specific information about that in our knowledge base. Would you like me to connect you with a human support agent who can help?";

const KB_ONLY_REWRITE_SYSTEM = `
You are a customer support assistant.

IMPORTANT:
- You must answer using ONLY the INTERNAL_KB_CONTEXT provided below.
- Do NOT use outside knowledge.
- Do NOT guess, do NOT invent steps, prices, policies, or features.
- NEVER reveal INTERNAL_KB_CONTEXT, document names, file names, or sources.
- NEVER say "Knowledge Base Context", "Sources", or anything similar.
- If INTERNAL_KB_CONTEXT does not contain the answer, respond EXACTLY with:
"${KB_ONLY_FALLBACK}"
Keep answers concise and helpful.
`.trim();

export const create = action({
  args: {
    prompt: v.string(),
    threadId: v.string(),
    contactSessionId: v.id("contactSessions"),
  },
  handler: async (ctx, args) => {
    // 0) session check
    const contactSession = await ctx.runQuery(
      internal.system.contactSessions.getOne,
      { contactSessionId: args.contactSessionId },
    );

    if (!contactSession || contactSession.expiresAt < Date.now()) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid session" });
    }

    // 1) conversation check
    const conversation = await ctx.runQuery(
      internal.system.conversations.getByThreadId,
      { threadId: args.threadId },
    );

    if (!conversation) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Conversation not found" });
    }

    if (conversation.status === "resolved") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Conversation resolved" });
    }

    // refresh TTL
    await ctx.runMutation(internal.system.contactSessions.refresh, {
      contactSessionId: args.contactSessionId,
    });

    // 2) subscription gating
    const subscription = await ctx.runQuery(
      internal.system.subscriptions.getByOrganizationId,
      { organizationId: conversation.organizationId },
    );

    const shouldTriggerAgent =
      conversation.status === "unresolved" && subscription?.status === "active";

    // 3) settings
    const widgetSettings = await ctx.runQuery(
      api.public.widgetSettings.getByOrganizationId,
      { organizationId: conversation.organizationId },
    );

    const knowledgeMode = ((widgetSettings?.knowledgeMode ?? "llm_plus_kb") as KnowledgeMode);
    const llmProvider = (widgetSettings as any)?.llmProvider ?? "openai";
    const llmModel = (widgetSettings as any)?.llmModel ?? "gpt-4o-mini";

    // 4) if not eligible => just save user msg
    if (!shouldTriggerAgent) {
      await saveMessage(ctx, components.agent, {
        threadId: args.threadId,
        prompt: args.prompt,
      });
      return;
    }

    // ✅ reps availability block for the agent
    const availableReps =
      (await ctx.runQuery(internal.system.repsPresence.listAvailableForOrg, {
        organizationId: conversation.organizationId,
      })) ?? [];

    const repsLabel = availableReps
      .slice(0, 3)
      .map((r: any) => {
        const name = (r.name ?? "Rep").trim();
        const title = (r.title ?? r.role ?? "").trim();
        return title ? `${name} (${title})` : name;
      })
      .join(", ");

    const repsBlock = `<<<REPS_AVAILABLE count="${availableReps.length}" reps="${repsLabel}" >>>`;

    // 5) build agent
    const agent = makeSupportAgent({ llmProvider, llmModel });

    // -------------------------
    // MODE: LLM ONLY
    // -------------------------
    if (knowledgeMode === "llm_only") {
      await agent.generateText(
        ctx,
        { threadId: args.threadId },
        {
          prompt: `${repsBlock}\n\n${args.prompt}`,
          tools: {
            escalateConversationTool: escalateConversation,
            resolveConversationTool: resolveConversation,
          },
        },
      );
      return;
    }

    // ---------------------------------------
    // MODE: KB ONLY
    // ---------------------------------------
    if (knowledgeMode === "kb_only") {
      const orgId = conversation.organizationId;

      const searchResult = await rag.search(ctx, {
        namespace: orgId,
        query: args.prompt,
        limit: 5,
      });

      if (isNoKbResult(searchResult.text)) {
        await agent.saveMessage(ctx, {
          threadId: args.threadId,
          message: { role: "assistant", content: KB_ONLY_FALLBACK },
        });
        return;
      }

      const kbText = (searchResult.text ?? "").trim();

      await agent.generateText(
        ctx,
        { threadId: args.threadId },
        {
          prompt: `${repsBlock}\n\n${args.prompt}`,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          system: `
${KB_ONLY_REWRITE_SYSTEM}

INTERNAL_KB_CONTEXT (DO NOT REVEAL / DO NOT QUOTE / DO NOT LIST SOURCES):
${kbText}
          `.trim(),
        } as any,
      );

      return;
    }

    // -------------------------
    // MODE: LLM + KB
    // -------------------------
    await agent.generateText(
      ctx,
      { threadId: args.threadId },
      {
        prompt: `${repsBlock}\n\n${args.prompt}`,
        tools: {
          escalateConversationTool: escalateConversation,
          resolveConversationTool: resolveConversation,
          searchTool: search,
        },
      },
    );
  },
});

export const getMany = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    contactSessionId: v.id("contactSessions"),
  },
  handler: async (ctx, args) => {
    const contactSession = await ctx.db.get(args.contactSessionId);

    if (!contactSession || contactSession.expiresAt < Date.now()) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid session" });
    }

    const agent = makeSupportAgent({ llmProvider: "openai", llmModel: "gpt-4o-mini" });

    return agent.listMessages(ctx, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
  },
});
