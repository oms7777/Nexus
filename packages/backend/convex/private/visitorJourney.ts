import { ConvexError, v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { buildLeadSummaryInputPayload } from "./leadSummaryAi";

/**
 * Downloadable JSON: full timeline (no rrweb blob), aggregated dwell, chat transcript, optional AI summary.
 */
export const exportJourney = action({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { conversationId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
    }
    const orgId = (identity as any).orgId as string | undefined;
    const meUserId = (identity as any).subject as string | undefined;
    if (!orgId || !meUserId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const conv = await ctx.runQuery(api.private.conversations.getOne, { conversationId });
    if (!conv || conv.organizationId !== orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid conversation" });
    }

    const session = conv.contactSession;
    const snaps = await ctx.runQuery(internal.private.visitorJourneyHelpers.listSnapshotsForSession, {
      contactSessionId: session._id,
    });

    const digest = await ctx.runQuery(internal.private.leadDigest.getEscalationDigestPayload, {
      conversationId,
    });

    const timeline = snaps.map((r) => ({
      ts: r.ts,
      iso: new Date(r.ts).toISOString(),
      pageUrl: r.pageUrl,
      title: r.title,
      width: r.width,
      height: r.height,
    }));

    const c = await ctx.runQuery(internal.private.visitorJourneyHelpers.getConversationAiFields, {
      conversationId,
    });

    return {
      exportedAt: new Date().toISOString(),
      organizationId: orgId,
      conversationId,
      contactSessionId: session._id,
      visitor: {
        name: session.name,
        email: session.email,
        phone: session.phone,
      },
      metadata: session.metadata ?? {},
      pageTimeline: timeline,
      pageStaysAggregated: digest.ok ? digest.pageStays : [],
      chatTranscriptLines: digest.ok ? digest.chatLines : [],
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
  handler: async (ctx, { conversationId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
    }
    const orgId = (identity as any).orgId as string | undefined;
    const meUserId = (identity as any).subject as string | undefined;
    if (!orgId || !meUserId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const conv = await ctx.runQuery(api.private.conversations.getOne, { conversationId });
    if (!conv || conv.organizationId !== orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid conversation" });
    }

    const data = await ctx.runQuery(internal.private.leadDigest.getEscalationDigestPayload, {
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

    const ai = await ctx.runAction(internal.private.leadSummaryAi.generateLeadSummaryAi, {
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
