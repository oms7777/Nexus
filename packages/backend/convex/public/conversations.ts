// packages/backend/convex/public/conversations.ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { api, components, internal } from "../_generated/api";
import { supportAgent } from "../system/ai/agents/supportAgent";
import { saveMessage, type MessageDoc } from "@convex-dev/agent";
import type { Id } from "../_generated/dataModel";

export const getMany = query({
  args: {
    contactSessionId: v.id("contactSessions"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const contactSession = await ctx.db.get(args.contactSessionId);

    if (!contactSession || contactSession.expiresAt < Date.now()) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid Session" });
    }

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_contact_session_id", (q) => q.eq("contactSessionId", args.contactSessionId))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      conversations.page.map(async (conversation) => {
        let lastMessage: MessageDoc | null = null;

        const messages = await supportAgent.listMessages(ctx, {
          threadId: conversation.threadId,
          paginationOpts: { numItems: 1, cursor: null },
        });

        if (messages.page.length > 0) lastMessage = messages.page[0] ?? null;

        return {
          _id: conversation._id,
          _creationTime: conversation._creationTime,
          status: conversation.status,
          organizationId: conversation.organizationId,
          threadId: conversation.threadId,
          lastMessage,
          // ✅ API return can be null (fine)
          assignedRepUserId: conversation.assignedRepUserId ?? null,
          assignedTerritoryKey: conversation.assignedTerritoryKey ?? null,
        };
      }),
    );

    return { ...conversations, page };
  },
});

export const getOne = query({
  args: {
    conversationId: v.id("conversations"),
    contactSessionId: v.id("contactSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.contactSessionId);

    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid Session" });
    }

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Conversation not found" });
    }

    if (conversation.contactSessionId !== session._id) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Incorrect session" });
    }

    return {
      _id: conversation._id,
      status: conversation.status,
      threadId: conversation.threadId,
      escalatedAt: (conversation as any).escalatedAt ?? null,
      assignedRepUserId: conversation.assignedRepUserId ?? null,
      assignedTerritoryKey: conversation.assignedTerritoryKey ?? null,
    };
  },
});

export const create = mutation({
  args: {
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
    suppressGreet: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.contactSessionId);

    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid Session" });
    }
    if (session.organizationId !== args.organizationId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid Organization" });
    }

    // Refresh TTL
    await ctx.runMutation(internal.system.contactSessions.refresh, {
      contactSessionId: args.contactSessionId,
    });

    // ✅ Ensure stable assignment exists ON THE SESSION
    const assignment = await ctx.runMutation(api.routing.ensureAssignmentForSession, {
      organizationId: args.organizationId,
      contactSessionId: args.contactSessionId,
    });

    // ✅ Convex DB wants string | undefined (not null)
    const sessionAssignedRep: string | undefined = assignment.assignedRepUserId ?? undefined;
    const sessionTerritory: string | undefined = assignment.assignedTerritoryKey ?? undefined;

    const existingActive = await ctx.db
      .query("conversations")
      .withIndex("by_contact_session_id", (q) => q.eq("contactSessionId", session._id))
      .order("desc")
      .first();

    if (
      existingActive &&
      existingActive.organizationId === args.organizationId &&
      existingActive.status !== "resolved"
    ) {
      const needsPatch =
        existingActive.assignedRepUserId !== sessionAssignedRep ||
        existingActive.assignedTerritoryKey !== sessionTerritory;

      if (needsPatch) {
        await ctx.db.patch(existingActive._id, {
          assignedRepUserId: sessionAssignedRep,
          assignedTerritoryKey: sessionTerritory,
        });
      }

      // Do not log experience_shown on reuse — it inflated session→meeting rates.
      await ctx.runMutation(api.public.analytics.log, {
        organizationId: args.organizationId,
        type: "conversation_reused",
        sessionId: args.contactSessionId,
        conversationId: existingActive._id,
        meta: { threadId: existingActive.threadId },
      });

      return { conversationId: existingActive._id, threadId: existingActive.threadId };
    }

    const widgetSettings = await ctx.db
      .query("widgetSettings")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    const { threadId } = await supportAgent.createThread(ctx, { userId: args.organizationId });

    if (!args.suppressGreet) {
      await saveMessage(ctx, components.agent, {
        threadId,
        message: {
          role: "assistant",
          content: widgetSettings?.greetMessage || "Hello, how can I help you today?",
        },
      });
    }

    const conversationId: Id<"conversations"> = await ctx.db.insert("conversations", {
      contactSessionId: session._id,
      status: "unresolved",
      organizationId: args.organizationId,
      threadId,
      assignedRepUserId: sessionAssignedRep,
      assignedTerritoryKey: sessionTerritory,
    });

    await ctx.runMutation(api.public.analytics.log, {
      organizationId: args.organizationId,
      type: "conversation_created",
      sessionId: args.contactSessionId,
      conversationId,
      meta: {
        threadId,
        suppressGreet: !!args.suppressGreet,
        assignedRepUserId: sessionAssignedRep ?? null,
        assignedTerritoryKey: sessionTerritory ?? null,
      },
    });

    return { conversationId, threadId };
  },
});