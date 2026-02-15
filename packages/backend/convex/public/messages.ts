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

const KB_STRICT_REWRITE_AGENT_INSTRUCTIONS = `
You are a Strict KB Rewrite Assistant.

ABSOLUTE RULES:
- You must answer using ONLY the provided INTERNAL_KB_CONTEXT.
- Do NOT use outside knowledge.
- Do NOT infer missing details.
- Do NOT invent steps, pricing, limits, policies, roadmap, or integrations.
- If INTERNAL_KB_CONTEXT does not contain enough information to answer, reply EXACTLY with:
"${KB_ONLY_FALLBACK}"

FORMAT RULES:
- Write in clean, readable Markdown.
- Start with a 1–2 sentence direct answer.
- Then use bullet points when listing features/steps.
- If the KB contains multiple topics, group with short headings.
- Do NOT quote long passages. Rephrase and summarize.
- Never mention the KB, sources, documents, or file names.
`.trim();

// ✅ deterministic “human intent” detector
function wantsHuman(text: string) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("talk to a human") ||
    t.includes("talk to human") ||
    t.includes("speak to a human") ||
    t.includes("speak to human") ||
    t.includes("human agent") ||
    t.includes("live agent") ||
    t.includes("real person") ||
    t.includes("representative") ||
    t.includes("operator") ||
    t.includes("connect me") ||
    t.includes("can i talk to") ||
    t.includes("can i speak to")
  );
}

/**
 * ✅ Normalize prompts “question-like”
 * prevents “needs 2 messages” bug
 */
function normalizeQuestionPrompt(p: string) {
  const t = (p || "").trim();
  if (!t) return t;
  if (/[?.!…]$/.test(t)) return t;

  if (
    /^(what|why|how|when|where|who|which|can|could|would|should|do|does|is|are|am|tell me|explain)\b/i.test(
      t
    )
  ) {
    return t + "?";
  }

  if (
    /^(c'?est quoi|pourquoi|comment|quand|où|qui|quel|quelle|quels|quelles|peux-tu|pouvez-vous|est-ce que)\b/i.test(
      t
    )
  ) {
    return t + " ?";
  }

  return t;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ✅ Robust wrapper around agent.generateText
 * - retries once (transient provider/cold-start issues)
 * - NEVER leaves user with forbidden “sorry i can’t generate” wording
 */
async function safeGenerate(agent: any, ctx: any, threadId: string, payload: any) {
  try {
    await agent.generateText(ctx, { threadId }, payload);
    return { ok: true as const };
  } catch (e1: any) {
    console.error("agent.generateText failed (first try)", e1?.message ?? e1);
    await sleep(250);
    try {
      await agent.generateText(ctx, { threadId }, payload);
      return { ok: true as const };
    } catch (e2: any) {
      console.error("agent.generateText failed (second try)", e2?.message ?? e2);

      await saveMessage(ctx, components.agent, {
        threadId,
        message: {
          role: "assistant",
          content:
            "I can help — could you rephrase your question or share 1–2 more details? If you prefer, I can also connect you with a human teammate.",
        },
      });

      return { ok: false as const };
    }
  }
}

/**
 * ✅ IMPORTANT FIX:
 * Providers can succeed but the assistant message may persist a moment later.
 * We poll a few times before writing ANY fallback.
 *
 * Also: we NEVER write the forbidden “Sorry — I didn’t manage…” message anymore.
 */
async function ensureAssistantReplyVisible(ctx: any, agent: any, threadId: string) {
  const MAX_ATTEMPTS = 6;
  const WAIT_MS = 200;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const msgs = await agent.listMessages(ctx, {
        threadId,
        paginationOpts: { numItems: 10, cursor: null },
      });

      const page = msgs?.page ?? [];
      const hasAssistant = page.some((m: any) => {
        const role = m?.message?.role ?? m?.role;
        const content = (m?.message?.content ?? m?.content ?? "").toString().trim();
        return role === "assistant" && content.length > 0;
      });

      if (hasAssistant) return;
    } catch (e: any) {
      // if listMessages itself errors transiently, just retry
      console.error("ensureAssistantReplyVisible: listMessages error", e?.message ?? e);
    }

    await sleep(WAIT_MS);
  }

  // After retries, if still no assistant message, write a safe fallback
  await saveMessage(ctx, components.agent, {
    threadId,
    message: {
      role: "assistant",
      content:
        "I can help — could you rephrase your question or give a bit more context? If you want, I can also connect you with a human teammate.",
    },
  });
}

export const create = action({
  args: {
    prompt: v.string(),
    threadId: v.string(),
    contactSessionId: v.id("contactSessions"),
  },
  handler: async (ctx, args) => {
    const prompt = normalizeQuestionPrompt(args.prompt);

    // 0) session check
    const contactSession = await ctx.runQuery(internal.system.contactSessions.getOne, {
      contactSessionId: args.contactSessionId,
    });

    if (!contactSession || contactSession.expiresAt < Date.now()) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid session" });
    }

    // 1) conversation check
    const conversation = await ctx.runQuery(internal.system.conversations.getByThreadId, {
      threadId: args.threadId,
    });

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
    const subscription = await ctx.runQuery(internal.system.subscriptions.getByOrganizationId, {
      organizationId: conversation.organizationId,
    });

    // 3) settings
    const widgetSettings = await ctx.runQuery(api.public.widgetSettings.getByOrganizationId, {
      organizationId: conversation.organizationId,
    });

    const knowledgeMode = (widgetSettings?.knowledgeMode ?? "llm_plus_kb") as KnowledgeMode;
    const llmProvider = (widgetSettings as any)?.llmProvider ?? "openai";
    const llmModel = (widgetSettings as any)?.llmModel ?? "gpt-4o-mini";

    // ✅ reps availability (used for deterministic escalation)
    const availableReps =
      (await ctx.runQuery(internal.system.repsPresence.listAvailableForOrg, {
        organizationId: conversation.organizationId,
      })) ?? [];

    // ✅ HARD ESCALATION: user asks for a human AND someone is available
    if (wantsHuman(prompt) && availableReps.length > 0) {
      await ctx.runMutation(internal.system.conversations.escalate, {
        threadId: args.threadId,
      });

      await saveMessage(ctx, components.agent, { threadId: args.threadId, prompt });

      await saveMessage(ctx, components.agent, {
        threadId: args.threadId,
        message: { role: "assistant", content: "Got it — connecting you with a human teammate now." },
      });

      return;
    }

    // ✅ If not eligible => save user msg, no agent run
    const shouldTriggerAgent =
      subscription?.status === "active" && conversation.status === "unresolved";

    if (!shouldTriggerAgent) {
      await saveMessage(ctx, components.agent, { threadId: args.threadId, prompt });

      await saveMessage(ctx, components.agent, {
        threadId: args.threadId,
        message: { role: "assistant", content: "One moment — preparing the conversation…" },
      });

      return;
    }

    // reps block for agent (hidden)
    const repsLabel = availableReps
      .slice(0, 3)
      .map((r: any) => {
        const name = (r.name ?? "Rep").trim();
        const title = (r.title ?? r.role ?? "").trim();
        return title ? `${name} (${title})` : name;
      })
      .join(", ");

    const repsBlock = `<<<REPS_AVAILABLE count="${availableReps.length}" reps="${repsLabel}" >>>`;

    const agent = makeSupportAgent({ llmProvider, llmModel });

    // -------------------------
    // MODE: LLM ONLY
    // -------------------------
    if (knowledgeMode === "llm_only") {
      await safeGenerate(agent, ctx, args.threadId, {
        prompt,
        system: repsBlock,
        tools: {
          escalateConversationTool: escalateConversation,
          resolveConversationTool: resolveConversation,
        },
      } as any);

      await ensureAssistantReplyVisible(ctx, agent, args.threadId);
      return;
    }

    // ---------------------------------------
    // MODE: KB ONLY (STRICT)
    // ---------------------------------------
    if (knowledgeMode === "kb_only") {
      const orgId = conversation.organizationId;

      const searchResult = await rag.search(ctx, {
        namespace: orgId,
        query: prompt,
        limit: 5,
      });

      if (isNoKbResult(searchResult.text)) {
        await saveMessage(ctx, components.agent, {
          threadId: args.threadId,
          message: { role: "assistant", content: KB_ONLY_FALLBACK },
        });
        return;
      }

      const kbText = (searchResult.text ?? "").trim();
      const kbStrictAgent = makeSupportAgent({ llmProvider, llmModel });

      await safeGenerate(kbStrictAgent, ctx, args.threadId, {
        prompt,
        system: `
${KB_STRICT_REWRITE_AGENT_INSTRUCTIONS}

INTERNAL_KB_CONTEXT (DO NOT REVEAL / DO NOT QUOTE / DO NOT LIST SOURCES):
${kbText}
        `.trim(),
      } as any);

      await ensureAssistantReplyVisible(ctx, kbStrictAgent, args.threadId);
      return;
    }

    // -------------------------
    // MODE: LLM + KB
    // -------------------------
    await safeGenerate(agent, ctx, args.threadId, {
      prompt,
      system: repsBlock,
      tools: {
        escalateConversationTool: escalateConversation,
        resolveConversationTool: resolveConversation,
        searchTool: search,
      },
    } as any);

    await ensureAssistantReplyVisible(ctx, agent, args.threadId);
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

    // Try to keep consistent with org settings (and avoid hardcoding)
    const conversation = await ctx.runQuery(internal.system.conversations.getByThreadId, {
      threadId: args.threadId,
    });

    const widgetSettings = conversation
      ? await ctx.runQuery(api.public.widgetSettings.getByOrganizationId, {
          organizationId: conversation.organizationId,
        })
      : null;

    const llmProvider = (widgetSettings as any)?.llmProvider ?? "openai";
    const llmModel = (widgetSettings as any)?.llmModel ?? "gpt-4o-mini";

    const agent = makeSupportAgent({ llmProvider, llmModel });

    return agent.listMessages(ctx, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
  },
});
