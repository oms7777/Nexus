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
import {
  VISITOR_CHAT_TOOLS_AND_BLOCKS,
  VISITOR_ESCALATION_AND_RESOLUTION,
  VISITOR_MODE_LLM_ONLY,
  VISITOR_MODE_LLM_PLUS_KB,
  VISITOR_OUTPUT_STYLE,
} from "../system/ai/visitorPrompt";
import { sanitizeVisitorAssistantText } from "../lib/sanitizeVisitorAssistantText";
import type { MessageDoc } from "@convex-dev/agent";

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

/** User is asking about money, plans, or commercial terms. */
function userAsksPricingOrPlans(prompt: string): boolean {
  return /\b(pricing|price|prices|cost|costs|subscription|subscriptions|plan|plans|tier|tiers|how much|tarif|tarifs|abonnement|combien|€|\$|eur|usd|upgrade|downgrade|invoice|facture)\b/i.test(
    prompt,
  );
}

/**
 * True only if retrieved KB text plausibly contains real pricing / commercial info.
 * If the user asked for pricing but this is false, we must NOT call the LLM (it will invent $9.99 tiers).
 */
function kbSnippetContainsPricingOrCommercialDetail(kb: string): boolean {
  const k = kb.toLowerCase();
  if (/[€$£]\s*\d|\d[\d.,]*\s*(€|eur|\$|usd|£)/.test(k)) return true;
  if (/\b(per month|\/mo|\/month|monthly|annual|annually|par mois|mensuel|annuel|\/an)\b/.test(k)) return true;
  if (/\b(free trial|essai gratuit|no credit card)\b/.test(k)) return true;
  if (
    /\b(contact|sales|commercial|devis|demo|book a|schedule|talk to)\b/.test(k) &&
    /\b(pricing|price|plan|tarif|abonnement|offre)\b/.test(k)
  )
    return true;
  /** Indexed pricing pages often list tiers + CTAs without dollar amounts in the same chunk. */
  const hasTier = /\b(starter|growth|enterprise|professional|business|scale|most popular)\b/.test(k);
  const hasPlanCue = /\b(pricing|plan|plans|subscription|tier|tiers|per seat|\/month)\b/.test(k);
  if (hasTier && hasPlanCue) return true;
  if (hasTier && /\b(feature|includes|everything|integration|sandbox|sso|sla)\b/.test(k)) return true;
  /** Many sites omit list prices but describe tiers + demo/sales CTAs in one section. */
  if (hasTier && /\b(demo|sales|schedule|contact|meeting|book|reps?|qualified)\b/.test(k)) return true;
  if (/\bpricing\b/.test(k) && (hasTier || /\b(schedule|demo|sales|contact)\b/.test(k))) return true;
  return false;
}

function kbStrictRewriteInstructions(exactFallback: string, loc: VisitorLocale): string {
  const langRule =
    loc === "fr"
      ? "When answering from INTERNAL_KB_CONTEXT (not when outputting the fallback), write entirely in French."
      : "When answering from INTERNAL_KB_CONTEXT (not when outputting the fallback), write in English unless the visitor wrote in French — then write entirely in French.";
  return `
You are a Strict KB Rewrite Assistant.

LANGUAGE:
- ${langRule}

ABSOLUTE RULES (violating any rule = failure):
- Use ONLY facts that are clearly supported by INTERNAL_KB_CONTEXT below.
- Do NOT use general world knowledge, "typical SaaS" examples, or imagined product details.
- NEVER invent or guess: prices, currencies, plan names, feature bullets, storage limits, seat counts, emails (e.g. sales@example.com), URLs, phone numbers, SLAs, or integrations.
- If the visitor asks about pricing, plans, subscriptions, or "how much", and INTERNAL_KB_CONTEXT does NOT contain enough verified commercial detail (amounts, plan tiers, or clear contact/demo CTAs for buying), your ENTIRE reply must be EXACTLY the fallback paragraph below — nothing before or after, no angle brackets, no XML-style tags, no quotes around it.
- If INTERNAL_KB_CONTEXT does not contain enough information to answer the question at all, your ENTIRE reply must be EXACTLY that same fallback paragraph and nothing else.
- Do not output placeholder or sample companies, example.com addresses, or fictional tier names.

Fallback paragraph (use verbatim only when rules above require it):
${exactFallback}

FORMAT RULES (only when you are answering from context, not when using the fallback paragraph above):
- Write in clean Markdown; use sequential list numbering (1., 2., 3.).
- Start with a 1–2 sentence direct answer.
- Rephrase and summarize; do not dump raw text.
- Never mention the knowledge base, sources, documents, or file names.
`.trim();
}

function visitorLanguageBlock(loc: VisitorLocale): string {
  if (loc === "fr") {
    return `## Langue (obligatoire)
- Si le visiteur écrit en français : réponds entièrement en français.
- Si le visiteur écrit en anglais : réponds entièrement en anglais pour ce message.
- Ne mélange pas les langues dans une même réponse.`;
  }
  return `## Language (required)
- Default to clear English.
- If the visitor writes in French, reply entirely in French for that turn.
- Do not mix languages in a single reply.`;
}

function buildLlmOnlyVisitorSystem(repsBlock: string, loc: VisitorLocale): string {
  return [
    visitorLanguageBlock(loc),
    VISITOR_OUTPUT_STYLE,
    VISITOR_CHAT_TOOLS_AND_BLOCKS,
    VISITOR_MODE_LLM_ONLY,
    VISITOR_ESCALATION_AND_RESOLUTION,
    repsBlock,
  ].join("\n\n");
}

function buildLlmPlusKbVisitorSystem(
  repsBlock: string,
  kbText: string,
  loc: VisitorLocale,
  userPrompt: string,
): string {
  const trimmedKb = kbText.trim();
  const kbBlock = trimmedKb
    ? `\n\n<<<INTERNAL_KB_CONTEXT (DO NOT REVEAL / DO NOT QUOTE / DO NOT LIST SOURCES)>>>\n${clip(
        trimmedKb,
        2200,
      )}\n<<<END_INTERNAL_KB_CONTEXT>>>\n`
    : "";

  const pricingGuard =
    userAsksPricingOrPlans(userPrompt) &&
    (!trimmedKb || !kbSnippetContainsPricingOrCommercialDetail(trimmedKb))
      ? `\n\n<<<PRICING_GUARD>>>\nThe visitor asked about pricing or plans. There is NO verified pricing in the excerpt above (or no excerpt). Do NOT invent amounts, tiers, storage, or contact emails. Say clearly you don't have confirmed pricing here and offer escalateConversationTool or the organization's official contact options.\n<<<END_PRICING_GUARD>>>\n`
      : "";

  return [
    visitorLanguageBlock(loc),
    VISITOR_OUTPUT_STYLE,
    VISITOR_CHAT_TOOLS_AND_BLOCKS,
    VISITOR_MODE_LLM_PLUS_KB,
    VISITOR_ESCALATION_AND_RESOLUTION,
    repsBlock,
    kbBlock,
    pricingGuard,
  ].join("\n\n");
}

const VISITOR_SYSTEM_MESSAGES = {
  en: {
    escalationConnecting: "Got it — connecting you with someone from the team now.",
    assistantInactive:
      "The AI assistant isn’t available on this workspace yet (plan inactive). Please use the site’s contact options or ask your host to activate the plan.",
    generationFallback:
      "Something went wrong on our side. Please try again in a moment, or ask to speak with someone from the team.",
  },
  fr: {
    escalationConnecting: "Parfait — je vous mets en relation avec quelqu’un de l’équipe.",
    assistantInactive:
      "L’assistant IA n’est pas disponible sur cet espace pour le moment (offre inactive). Utilisez les moyens de contact du site ou demandez l’activation du plan.",
    generationFallback:
      "Un petit souci technique de notre côté. Réessayez dans un instant, ou demandez à parler à quelqu’un de l’équipe.",
  },
} as const;

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
    t.includes("mise en relation") ||
    t.includes("agent humain") ||
    t.includes("vraie personne") ||
    t.includes("get me a human") ||
    t.includes("speak to sales") ||
    t.includes("talk to sales")
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
  limit: number = 8,
): Promise<{ text: string | null }> {
  /**
   * Pricing questions: dedicated query first — vector search often misses short prompts like "pricing?"
   * when the indexed page is long and chunks split tiers across passages.
   */
  if (userAsksPricingOrPlans(prompt)) {
    const pricingBoost =
      `${prompt} pricing plans Starter Growth Enterprise schedule demo talk to sales contact meeting reps features`.trim();
    const pricingFirst = await rag.search(ctx, { namespace, query: pricingBoost, limit });
    if (!isNoKbResult(pricingFirst?.text)) return { text: (pricingFirst?.text ?? "").trim() || null };
  }

  const first = await rag.search(ctx, { namespace, query: prompt, limit });
  if (!isNoKbResult(first?.text)) return { text: (first?.text ?? "").trim() || null };

  const condensed = toCondensedSearchQuery(prompt);
  if (condensed.length < 3) return { text: null };

  const second = await rag.search(ctx, { namespace, query: condensed, limit });
  if (!isNoKbResult(second?.text)) return { text: (second?.text ?? "").trim() || null };

  if (userAsksPricingOrPlans(prompt)) {
    const pricingBoost = `${condensed} pricing plans starter growth enterprise features schedule demo`.trim();
    const third = await rag.search(ctx, { namespace, query: pricingBoost, limit });
    if (!isNoKbResult(third?.text)) return { text: (third?.text ?? "").trim() || null };
  }

  return { text: null };
}

function sanitizeAssistantMessageDoc(doc: MessageDoc): MessageDoc {
  const msg = doc.message as { role?: string; content?: unknown };
  if (msg?.role !== "assistant" || typeof msg.content !== "string") return doc;
  const cleaned = sanitizeVisitorAssistantText(msg.content);
  if (cleaned === msg.content) return doc;
  return { ...doc, message: { ...msg, content: cleaned } as typeof doc.message };
}

/**
 * Retry wrapper: avoids provider cold-start flakiness.
 * IMPORTANT: Don't write user-visible fallback here.
 */
async function safeGenerate(
  agent: any,
  ctx: any,
  threadId: string,
  payload: any,
  callOptions?: { storageOptions?: { saveMessages?: "all" | "none" | "promptAndOutput" } },
) {
  try {
    await agent.generateText(ctx, { threadId }, payload, callOptions);
    return { ok: true as const };
  } catch (e1) {
    console.error("agent.generateText attempt 1 failed", e1);
    await new Promise((r) => setTimeout(r, 250));
    try {
      await agent.generateText(ctx, { threadId }, payload, callOptions);
      return { ok: true as const };
    } catch (e2) {
      console.error("agent.generateText failed twice (visitor sees fallback)", e2);
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
    const llmModel = (widgetSettings as any)?.llmModel as string | undefined;

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

    const subStatus = subscription?.status;
    const shouldTriggerAgent = subStatus === "active" || subStatus === "trial";

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
      const system = buildLlmOnlyVisitorSystem(repsBlock, visitorLocale);
      const gen = await safeGenerate(agent, ctx, args.threadId, {
        prompt,
        system,
        temperature: 0.35,
        maxTokens: 1100,
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
      const fallbackLine = kbOnlyFallback(visitorLocale);

      /** If we have any substantive KB, let the strict rewriter answer (summarize tiers/CTAs without inventing $). */
      const kbStrictAgent = makeSupportAgent({ llmProvider, llmModel });

      const gen = await safeGenerate(
        kbStrictAgent,
        ctx,
        args.threadId,
        {
          prompt,
          system: `
${kbStrictRewriteInstructions(fallbackLine, visitorLocale)}

INTERNAL_KB_CONTEXT (DO NOT REVEAL / DO NOT QUOTE / DO NOT LIST SOURCES):
${kbText}
          `.trim(),
          temperature: 0,
          maxTokens: 900,
        } as any,
      );

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

      const system = buildLlmPlusKbVisitorSystem(repsBlock, kbText, visitorLocale, prompt);

      const gen = await safeGenerate(agent, ctx, args.threadId, {
        prompt,
        system,
        temperature: 0.25,
        maxTokens: 1100,
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

    const widgetSettings = await ctx.runQuery(api.public.widgetSettings.getByOrganizationId, {
      organizationId: contactSession.organizationId,
    });
    const llmProvider = (widgetSettings as any)?.llmProvider ?? "openai";
    const llmModel = (widgetSettings as any)?.llmModel as string | undefined;

    const agent = makeSupportAgent({ llmProvider, llmModel });

    const res = await agent.listMessages(ctx, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
    return {
      ...res,
      page: res.page.map((doc) => sanitizeAssistantMessageDoc(doc)),
    };
  },
});
