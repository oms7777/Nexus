import { ConvexError, v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { buildLeadSummaryInputPayload, type LeadSummaryAiResult } from "./leadSummaryAi";
import {
  formatTranscriptPlainText,
  type ChatMessageWithTimestamp,
  type EscalationDigestPayload,
  type PageStay,
} from "./leadDigest";

/** Matches `private/conversations.getOne` (null-normalized rep fields). */
type ConversationWithSession = Omit<Doc<"conversations">, "assignedRepUserId" | "assignedTerritoryKey"> & {
  contactSession: Doc<"contactSessions">;
  assignedRepUserId: string | null;
  assignedTerritoryKey: string | null;
};

type JourneyExport = {
  /** What this file contains (for humans / CRM integrators). */
  exportInfo: {
    schema: "nexus.journey.v2";
    description: string;
  };
  exportedAt: string;
  organizationId: string;
  conversationId: Id<"conversations">;
  contactSessionId: Id<"contactSessions">;
  conversation: {
    status: "unresolved" | "escalated" | "resolved";
    threadId: string;
    createdAt: string;
    escalatedAt: string | null;
  };
  visitor: { name?: string; email?: string; phone?: string };
  metadata: Record<string, unknown>;
  pageTimeline: Array<{
    ts: number;
    iso: string;
    pageUrl?: string;
    title?: string;
    width?: number;
    height?: number;
  }>;
  pageStaysAggregated: PageStay[];
  /** @deprecated Prefer `chatMessages` or `transcriptPlainText` — no per-message timestamps. */
  chatTranscriptLines: string[];
  /** Chronological chat with ISO timestamp per message (visitor vs assistant vs tool). */
  chatMessages: ChatMessageWithTimestamp[];
  /** Same as `chatMessages` as a single copy-paste block for email / tickets. */
  transcriptPlainText: string;
  intentHeuristic: string | null;
  traffic: { utmSource?: string; metadataPagesSample: string[] } | null;
  aiLeadSummary: string | null;
  aiLeadSummaryAt: number | null;
};

/**
 * Downloadable JSON: full timeline (no rrweb blob), aggregated dwell, chat with timestamps, optional AI summary.
 */
export const exportJourney = action({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { conversationId }): Promise<JourneyExport> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
    }
    const orgId = (identity as any).orgId as string | undefined;
    const meUserId = (identity as any).subject as string | undefined;
    if (!orgId || !meUserId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const conv: ConversationWithSession | null = await ctx.runQuery(api.private.conversations.getOne, {
      conversationId,
    });
    if (!conv || conv.organizationId !== orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid conversation" });
    }

    const session = conv.contactSession;
    const snaps: Doc<"sessionSnapshots">[] = await ctx.runQuery(
      internal.private.visitorJourneyHelpers.listSnapshotsForSession,
      {
        contactSessionId: session._id,
      },
    );

    const digest: EscalationDigestPayload = await ctx.runQuery(internal.private.leadDigest.getEscalationDigestPayload, {
      conversationId,
    });

    const timeline = snaps.map((r: Doc<"sessionSnapshots">) => ({
      ts: r.ts,
      iso: new Date(r.ts).toISOString(),
      pageUrl: r.pageUrl,
      title: r.title,
      width: r.width,
      height: r.height,
    }));

    const c: { aiLeadSummary?: string; aiLeadSummaryAt?: number } | null = await ctx.runQuery(
      internal.private.visitorJourneyHelpers.getConversationAiFields,
      {
        conversationId,
      },
    );

    const chatMessages: ChatMessageWithTimestamp[] = digest.ok ? digest.chatMessages : [];
    const transcriptPlainText = formatTranscriptPlainText(chatMessages);

    return {
      exportInfo: {
        schema: "nexus.journey.v2",
        description:
          "Inboundless session export: visitor fields, page views with timestamps, chat messages with ISO timestamps per line, optional AI lead summary. Field `chatTranscriptLines` is a legacy flat list without times; prefer `chatMessages` or `transcriptPlainText`.",
      },
      exportedAt: new Date().toISOString(),
      organizationId: orgId,
      conversationId,
      contactSessionId: session._id,
      conversation: {
        status: conv.status,
        threadId: conv.threadId,
        createdAt: new Date(conv._creationTime).toISOString(),
        escalatedAt:
          conv.escalatedAt != null ? new Date(conv.escalatedAt).toISOString() : null,
      },
      visitor: {
        name: session.name,
        email: session.email,
        phone: session.phone,
      },
      metadata: session.metadata ?? {},
      pageTimeline: timeline,
      pageStaysAggregated: digest.ok ? digest.pageStays : [],
      chatTranscriptLines: digest.ok ? digest.chatLines : [],
      chatMessages,
      transcriptPlainText,
      intentHeuristic: digest.ok ? digest.intent : null,
      traffic: digest.ok ? digest.traffic : null,
      aiLeadSummary: c?.aiLeadSummary ?? null,
      aiLeadSummaryAt: c?.aiLeadSummaryAt ?? null,
    };
  },
});

export const regenerateLeadSummary = action({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { conversationId }): Promise<{ markdown: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
    }
    const orgId = (identity as any).orgId as string | undefined;
    const meUserId = (identity as any).subject as string | undefined;
    if (!orgId || !meUserId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const conv: ConversationWithSession | null = await ctx.runQuery(api.private.conversations.getOne, {
      conversationId,
    });
    if (!conv || conv.organizationId !== orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid conversation" });
    }

    const data: EscalationDigestPayload = await ctx.runQuery(internal.private.leadDigest.getEscalationDigestPayload, {
      conversationId,
    });
    if (!data.ok) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Could not build digest" });
    }

    const payloadJson = buildLeadSummaryInputPayload({
      visitor: data.visitor,
      traffic: {
        utmSource: data.traffic.utmSource,
        metadataPagesSample: data.traffic.metadataPagesSample,
        referrer: data.visitor.referrer,
        landingUrl: data.visitor.landingUrl,
      },
      pageStays: data.pageStays,
      snapshotTimeline: data.snapshotTimeline.slice(0, 60),
      chatLines: data.chatLines,
      intentHeuristic: data.intent,
    });

    const ai: LeadSummaryAiResult = await ctx.runAction(internal.private.leadSummaryAi.generateLeadSummaryAi, {
      payloadJson,
    });

    if (!ai.ok || !ai.markdown) {
      throw new ConvexError({
        code: "INTERNAL",
        message: !ai.ok ? String((ai as { error?: string }).error) : "Empty AI summary",
      });
    }

    await ctx.runMutation(internal.private.leadSummaryStore.saveAiLeadSummary, {
      conversationId,
      markdown: ai.markdown,
    });

    return { markdown: ai.markdown };
  },
});
