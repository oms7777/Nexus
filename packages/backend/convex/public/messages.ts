// convex/public/messages.ts
import { ConvexError, v } from "convex/values";
import { action, query } from "../_generated/server";
import { components, internal } from "../_generated/api";
import { supportAgent } from "../system/ai/agents/supportAgent";
import { paginationOptsValidator } from "convex/server";
import { escalateConversation } from "../system/ai/tools/escalateConversation";
import { resolveConversation } from "../system/ai/tools/resolveConversation";
import { saveMessage } from "@convex-dev/agent";
import { search } from "../system/ai/tools/search";

type KnowledgeMode = "llm_only" | "llm_plus_kb" | "kb_only";

export const create = action({
  args: {
    prompt: v.string(),
    threadId: v.string(),
    contactSessionId: v.id("contactSessions"),
  },
  handler: async (ctx, args) => {
    const contactSession = await ctx.runQuery(
      internal.system.contactSessions.getOne,
      { contactSessionId: args.contactSessionId },
    );

    if (!contactSession || contactSession.expiresAt < Date.now()) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid session" });
    }

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

    const subscription = await ctx.runQuery(
      internal.system.subscriptions.getByOrganizationId,
      { organizationId: conversation.organizationId },
    );

    const shouldTriggerAgent =
      conversation.status === "unresolved" && subscription?.status === "active";

    // ✅ Read widget settings to decide knowledge mode
    const widgetSettings = await ctx.runQuery(
      internal.system.widgetSettings.getByOrganizationId,
      { organizationId: conversation.organizationId },
    );

    const knowledgeMode = ((widgetSettings as any)?.knowledgeMode ??
      "llm_plus_kb") as KnowledgeMode;

    // ✅ 1) If subscription inactive or not unresolved => just save message (no agent)
    if (!shouldTriggerAgent) {
      await saveMessage(ctx, components.agent, {
        threadId: args.threadId,
        prompt: args.prompt,
      });
      return;
    }

    // ✅ 2) Agent mode routing
    if (knowledgeMode === "llm_only") {
      // Agent sans searchTool (LLM strict)
      await supportAgent.generateText(
        ctx,
        { threadId: args.threadId },
        {
          prompt: args.prompt,
          tools: {
            escalateConversationTool: escalateConversation,
            resolveConversationTool: resolveConversation,
            // ❌ no searchTool
          },
        },
      );
      return;
    }

    if (knowledgeMode === "kb_only") {
      // KB-only: on fait une recherche, et on pousse le résultat dans le thread
      // puis on peut (optionnel) laisser l’agent répondre uniquement à partir de ça.
      // Ici: simple & robuste → on renvoie une réponse "KB" via agent avec searchTool
      // MAIS en forçant un prompt strict "use only search results".
      await supportAgent.generateText(
        ctx,
        { threadId: args.threadId },
        {
          prompt:
            `You are in KB_ONLY mode. Answer ONLY using the knowledge base search tool results. ` +
            `If you cannot find the answer in the KB, say you don't know and escalate.\n\nUser:\n${args.prompt}`,
          tools: {
            escalateConversationTool: escalateConversation,
            resolveConversationTool: resolveConversation,
            searchTool: search,
          },
        },
      );
      return;
    }

    // default: llm_plus_kb
    await supportAgent.generateText(
      ctx,
      { threadId: args.threadId },
      {
        prompt: args.prompt,
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

    const paginated = await supportAgent.listMessages(ctx, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });

    return paginated;
  },
});
