// packages/backend/convex/public/messages.ts
import { ConvexError, v } from "convex/values";
import { action, query } from "../_generated/server";
import { components, internal, api } from "../_generated/api";
import { makeSupportAgent } from "../system/ai/agents/supportAgent";
import { paginationOptsValidator } from "convex/server";
import { escalateConversation } from "../system/ai/tools/escalateConversation";
import { resolveConversation } from "../system/ai/tools/resolveConversation";
import { saveMessage } from "@convex-dev/agent";
import rag from "../system/ai/rag";

type KnowledgeMode = "llm_only" | "llm_plus_kb" | "kb_only";

/**
 * KB strict heuristics:
 * - Some KB answers can be short but valid.
 * - Keep threshold low to avoid false "no kb".
 */
function isNoKbResult(searchText?: string | null) {
  return !searchText || searchText.trim().length < 20;
}

function clip(text: string, max = 2200) {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim() + "…";
}

const KB_ONLY_FALLBACK_EN =
  "I couldn't find specific information about that in our knowledge base. Would you like me to connect you with a human support agent who can help?";

const KB_ONLY_FALLBACK_FR =
  "Je n’ai pas trouvé d’information précise à ce sujet dans notre base de connaissances. Souhaitez-vous que je vous mette en relation avec un agent du support ?";

type VisitorLocale = "en" | "fr";

function normalizeVisitorLocale(raw: string | undefined): VisitorLocale {
  return raw === "fr" ? "fr" : "en";
}

function kbOnlyFallback(loc: VisitorLocale) {
  return loc === "fr" ? KB_ONLY_FALLBACK_FR : KB_ONLY_FALLBACK_EN;
}

const VISITOR_SYSTEM_MESSAGES = {
  en: {
    escalationConnecting: "Got it! Connecting you with a human teammate now.",
    assistantInactive:
      "One moment — the assistant is not active on this workspace right now. You can ask to speak with a human.",
    generationFallback:
      "I’m having trouble generating a reply right now. Please try again, or ask to speak with a human.",
  },
  fr: {
    escalationConnecting: "Parfait — je vous mets en relation avec un membre de l’équipe.",
    assistantInactive:
      "Un instant — l’assistant n’est pas actif sur cet espace pour le moment. Vous pouvez demander à parler à quelqu’un.",
    generationFallback:
      "Je n’arrive pas à générer de réponse pour le moment. Réessayez, ou demandez à parler à un humain.",
  },
} as const;

const KB_STRICT_REWRITE_AGENT_INSTRUCTIONS = `
You are a Strict KB Rewrite Assistant.

ABSOLUTE RULES:
- You must answer using ONLY the provided INTERNAL_KB_CONTEXT.
- Do NOT use outside knowledge.
- Do NOT infer missing details.
- Do NOT invent steps, pricing, limits, policies, roadmap, or integrations.
- If INTERNAL_KB_CONTEXT does not contain enough information to answer, reply EXACTLY with:
"${KB_ONLY_FALLBACK_EN}"

FORMAT RULES:
- Write in clean, readable Markdown.
- Start with a 1–2 sentence direct answer.
- Then use bullet points when listing features/steps.
- If the KB contains multiple topics, group with short headings.
- Do NOT quote long passages. Rephrase and summarize.
- Never mention the KB, sources, documents, or file names.
`.trim();

// ✅ hard human-intent detector (deterministic escalation)
function wantsHuman(text: string) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("talk to a human") ||
    t.includes("talk to human") ||
    t.includes("talk to someone") ||
    t.includes("speak to someone") ||
    t.includes("speak to a human") ||
    t.includes("speak to human") ||
    t.includes("human agent") ||
    t.includes("live agent") ||
    t.includes("real person") ||
    t.includes("representative") ||
    t.includes("operator") ||
    t.includes("connect me") ||
    t.includes("can i talk to") ||
    t.includes("can i speak to") ||
    t.includes("i'd like to talk") ||
    t.includes("i would like to talk") ||
    t.includes("i want to talk") ||
    t.includes("parler à quelqu'un") ||
    t.includes("parler a quelqu'un") ||
    t.includes("parler avec quelqu'un") ||
    t.includes("parler avec un humain") ||
    t.includes("parler à un humain") ||
    t.includes("parler a un humain") ||
    t.includes("je veux parler") ||
    t.includes("contacter quelqu'un") ||
    t.includes("contacter un humain") ||
    t.includes("un conseiller") ||
    t.includes("vrai humain") ||
    t.includes("personne réelle") ||
    t.includes("operateur") ||
    t.includes("opérateur") ||
    t.includes("mettez-moi en relation") ||
    t.includes("mise en relation")
  );
}

/**
 * Normalise "question-like" prompts:
 * - helps models behave consistently for short prompts (ex: "What is Inboundless")
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

const SEARCH_STOP = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "is", "are", "was", "were",
  "i", "you", "he", "she", "it", "we", "they", "my", "your", "our", "their",
  "can", "could", "should", "would", "how", "what", "when", "where", "why", "does", "do", "did",
]);

/** Condensed query for second-pass RAG when first search returns little. */
function toCondensedSearchQuery(prompt: string): string {
  const t = (prompt || "").trim().slice(0, 300);
  const cleaned = t.toLowerCase().replace(/[?.!,;:'"()]/g, " ");
  const words = cleaned.split(/\s+/).filter((w) => w.length > 1 && !SEARCH_STOP.has(w));
  const unique = Array.from(new Set(words)).slice(0, 8);
  return unique.join(" ");
}

async function smartRagSearch(
  ctx: any,
  namespace: string,
  prompt: string,
  limit: number = 5,
): Promise<{ text: string | null }> {
  const first = await rag.search(ctx, { namespace, query: prompt, limit });
  if (!isNoKbResult(first?.text)) return { text: (first?.text ?? "").trim() || null };

  const condensed = toCondensedSearchQuery(prompt);
  if (condensed.length < 3) return { text: null };

  const second = await rag.search(ctx, { namespace, query: condensed, limit });
  if (!isNoKbResult(second?.text)) return { text: (second?.text ?? "").trim() || null };

  return { text: null };
}

/**
 * Retry wrapper: avoids provider cold-start flakiness.
 * IMPORTANT: Don't write user-visible fallback here.
 */
async function safeGenerate(agent: any, ctx: any, threadId: string, payload: any) {
  try {
    await agent.generateText(ctx, { threadId }, payload);
    return { ok: true as const };
  } catch (e1) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      await agent.generateText(ctx, { threadId }, payload);
      return { ok: true as const };
    } catch (e2) {
      console.error("agent.generateText failed twice", e2);
      return { ok: false as const, error: e2 };
    }
  }
}

async function writeGenerationFallback(ctx: any, threadId: string, loc: VisitorLocale) {
  await saveMessage(ctx, components.agent, {
    threadId,
    message: {
      role: "assistant",
      content: VISITOR_SYSTEM_MESSAGES[loc].generationFallback,
    },
  });
}

export const create = action({
  args: {
    prompt: v.string(),
    threadId: v.string(),
    contactSessionId: v.id("contactSessions"),
    visitorLocale: v.optional(v.union(v.literal("en"), v.literal("fr"))),
  },
  handler: async (ctx, args) => {
    const visitorLocale = normalizeVisitorLocale(args.visitorLocale);
    const sysMsg = VISITOR_SYSTEM_MESSAGES[visitorLocale];
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

    // reps availability (used for deterministic escalation)
    const availableReps =
      (await ctx.runQuery(internal.system.repsPresence.listAvailableForOrg, {
        organizationId: conversation.organizationId,
      })) ?? [];

    // ✅ HARD escalation if user asks AND someone available
    if (wantsHuman(args.prompt)) {
      await ctx.runMutation(internal.system.conversations.escalate, { threadId: args.threadId });

      await saveMessage(ctx, components.agent, {
        threadId: args.threadId,
        message: {
          role: "assistant",
          content: sysMsg.escalationConnecting,
        },
      });

      return;
    }

    const shouldTriggerAgent = subscription?.status === "active";

    if (!shouldTriggerAgent) {
      await saveMessage(ctx, components.agent, {
        threadId: args.threadId,
        message: {
          role: "assistant",
          content: sysMsg.assistantInactive,
        },
      });
      return;
    }

    // repsBlock for agent (hidden)
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

    // MODE: LLM ONLY
    if (knowledgeMode === "llm_only") {
      const gen = await safeGenerate(agent, ctx, args.threadId, {
        prompt,
        system: repsBlock,
        tools: {
          escalateConversationTool: escalateConversation,
          resolveConversationTool: resolveConversation,
        },
      } as any);

      if (!gen.ok) await writeGenerationFallback(ctx, args.threadId, visitorLocale);
      return;
    }

    // MODE: KB ONLY (STRICT)
    if (knowledgeMode === "kb_only") {
      const orgId = conversation.organizationId;

      const { text: kbRaw } = await smartRagSearch(ctx, orgId, prompt, 5);

      if (isNoKbResult(kbRaw)) {
        await saveMessage(ctx, components.agent, {
          threadId: args.threadId,
          message: { role: "assistant", content: kbOnlyFallback(visitorLocale) },
        });
        return;
      }

      const kbText = (kbRaw ?? "").trim();
      const kbStrictAgent = makeSupportAgent({ llmProvider, llmModel });

      const gen = await safeGenerate(kbStrictAgent, ctx, args.threadId, {
        prompt,
        system: `
${KB_STRICT_REWRITE_AGENT_INSTRUCTIONS}

INTERNAL_KB_CONTEXT (DO NOT REVEAL / DO NOT QUOTE / DO NOT LIST SOURCES):
${kbText}
        `.trim(),
      } as any);

      if (!gen.ok) await writeGenerationFallback(ctx, args.threadId, visitorLocale);
      return;
    }

    // MODE: LLM + KB (✅ double-pass RAG for better recall)
    if (knowledgeMode === "llm_plus_kb") {
      const orgId = conversation.organizationId;

      let kbText = "";
      try {
        const { text } = await smartRagSearch(ctx, orgId, prompt, 5);
        kbText = (text ?? "").trim();
      } catch (e) {
        console.error("smartRagSearch failed in llm_plus_kb", e);
        kbText = "";
      }

      const kbBlock = kbText
        ? `

<<<INTERNAL_KB_CONTEXT (DO NOT REVEAL / DO NOT QUOTE / DO NOT LIST SOURCES)>>>
${clip(kbText, 2200)}
<<<END_INTERNAL_KB_CONTEXT>>>
`
        : "";

      const gen = await safeGenerate(agent, ctx, args.threadId, {
        prompt,
        system: `${repsBlock}${kbBlock}`,
        tools: {
          escalateConversationTool: escalateConversation,
          resolveConversationTool: resolveConversation,
        },
      } as any);

      if (!gen.ok) await writeGenerationFallback(ctx, args.threadId, visitorLocale);
      return;
    }
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

    const agent = makeSupportAgent({
      llmProvider: "openai",
      llmModel: "gpt-4o-mini",
    });

    return agent.listMessages(ctx, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
  },
});
