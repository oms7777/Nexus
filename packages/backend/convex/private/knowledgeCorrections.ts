// packages/backend/convex/private/knowledgeCorrections.ts
import { ConvexError, v } from "convex/values";
import { action, internalQuery, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireOrgId } from "../lib/authz";
import rag from "../system/ai/rag";

/**
 * Learning loop: when a rep rewrites an answer the assistant got wrong, that
 * correction becomes a knowledge base entry. Every corrected conversation makes the
 * assistant permanently better for that customer, which is the part a competitor
 * cannot copy — it is the customer's own accumulated operational knowledge.
 */

const MAX_QUESTION_CHARS = 1000;
const MAX_ANSWER_CHARS = 8000;

/**
 * Strips casing, accents and punctuation so "Quels sont vos prix ?" and
 * "quels sont vos prix" resolve to the same correction.
 */
function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derives the entry key from the question, because `rag.add` replaces an entry with
 * the same key. Without this, re-correcting one topic piles up near-identical entries:
 * retrieval returns the 5 closest chunks ranked by similarity rather than recency, so
 * the duplicates would crowd out the rest of the knowledge base and a stale answer
 * could outrank the newest one.
 */
async function correctionKey(orgId: string, question: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizeQuestion(question)),
  );

  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");

  return `${orgId}/rep_correction/${hex.slice(0, 32)}`;
}

export const countForOrg = query({
  args: {},
  handler: async (ctx) => {
    const orgId = await requireOrgId(ctx);

    try {
      const namespace = await rag.getNamespace(ctx, { namespace: orgId });
      if (!namespace) return { total: 0 };

      // Bounded probe: the exact count matters less than "is the loop being used".
      const page = await rag.list(ctx, {
        namespaceId: namespace.namespaceId,
        paginationOpts: { numItems: 200, cursor: null },
      });

      const total = page.page.filter(
        (e) => (e.metadata as Record<string, unknown> | undefined)?.kind === "rep_correction",
      ).length;

      return { total };
    } catch (e) {
      console.log(`[knowledgeCorrections] count failed org=${orgId}:`, e);
      return { total: 0 };
    }
  },
});

/** Verifies the conversation belongs to the caller's org before indexing anything. */
export const assertConversationInOrg = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    organizationId: v.string(),
  },
  handler: async (ctx, { conversationId, organizationId }) => {
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.organizationId !== organizationId) {
      return { ok: false as const };
    }
    return { ok: true as const, threadId: conversation.threadId };
  },
});

export const submit = action({
  args: {
    conversationId: v.id("conversations"),
    /** What the visitor asked (usually the message preceding the bad answer). */
    question: v.string(),
    /** What the assistant should have said. */
    correctedAnswer: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: true; entryId: string }> => {
    const orgId = await requireOrgId(ctx);

    const question = args.question.trim().slice(0, MAX_QUESTION_CHARS);
    const correctedAnswer = args.correctedAnswer.trim().slice(0, MAX_ANSWER_CHARS);

    if (!question || !correctedAnswer) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Both the question and the corrected answer are required.",
      });
    }

    const conversation = await ctx.runQuery(
      internal.private.knowledgeCorrections.assertConversationInOrg,
      { conversationId: args.conversationId, organizationId: orgId },
    );

    if (!conversation.ok) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Conversation not found" });
    }

    // Stored as a Q/A pair: retrieval matches on the question, the answer is the payload.
    const text = [`Question: ${question}`, "", `Answer: ${correctedAnswer}`].join("\n");

    const { entryId } = await rag.add(ctx, {
      namespace: orgId,
      text,
      key: await correctionKey(orgId, question),
      title: question.length > 80 ? `${question.slice(0, 77)}…` : question,
      metadata: {
        kind: "rep_correction",
        conversationId: args.conversationId,
        folder: "Rep corrections",
      },
    });

    return { ok: true, entryId: String(entryId) };
  },
});
