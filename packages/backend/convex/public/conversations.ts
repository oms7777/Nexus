// convex/public/conversations.ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { supportAgent } from "../system/ai/agents/supportAgent";
import { MessageDoc, saveMessage } from "@convex-dev/agent";
import { components, internal } from "../_generated/api";
import { paginationOptsValidator } from "convex/server";
import { api } from "../_generated/api";

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
      .withIndex("by_contact_session_id", (q) =>
        q.eq("contactSessionId", args.contactSessionId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const conversationsWithLastMessage = await Promise.all(
      conversations.page.map(async (conversation) => {
        let lastMessage: MessageDoc | null = null;

        const messages = await supportAgent.listMessages(ctx, {
          threadId: conversation.threadId,
          paginationOpts: { numItems: 1, cursor: null },
        });

        if (messages.page.length > 0) {
          lastMessage = messages.page[0] ?? null;
        }

        return {
          _id: conversation._id,
          _creationTime: conversation._creationTime,
          status: conversation.status,
          organizationId: conversation.organizationId,
          threadId: conversation.threadId,
          lastMessage,
        };
      }),
    );

    return { ...conversations, page: conversationsWithLastMessage };
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

    // refresh TTL
    await ctx.runMutation(internal.system.contactSessions.refresh, {
      contactSessionId: args.contactSessionId,
    });

    // ✅ Idempotent: reuse an existing active conversation
    const existingActive = await ctx.db
      .query("conversations")
      .withIndex("by_contact_session_id", (q) =>
        q.eq("contactSessionId", session._id),
      )
      .order("desc")
      .first();

    if (
      existingActive &&
      existingActive.organizationId === args.organizationId &&
      existingActive.status !== "resolved"
    ) {
      // analytics (reused)
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
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();

    const { threadId } = await supportAgent.createThread(ctx, {
      userId: args.organizationId,
    });

    // greet conditionnel
    if (!args.suppressGreet) {
      await saveMessage(ctx, components.agent, {
        threadId,
        message: {
          role: "assistant",
          content: widgetSettings?.greetMessage || "Hello, how can I help you today?",
        },
      });
    }

    const conversationId = await ctx.db.insert("conversations", {
      contactSessionId: session._id,
      status: "unresolved",
      organizationId: args.organizationId,
      threadId,
    });

    // analytics
    await ctx.runMutation(api.public.analytics.log, {
      organizationId: args.organizationId,
      type: "experience_shown",
      sessionId: args.contactSessionId,
      conversationId,
      meta: { threadId, suppressGreet: !!args.suppressGreet },
    });

    await ctx.runMutation(api.public.analytics.log, {
      organizationId: args.organizationId,
      type: "conversation_created",
      sessionId: args.contactSessionId,
      conversationId,
      meta: { threadId, suppressGreet: !!args.suppressGreet },
    });

    // ✅ NEW return
    return { conversationId, threadId };
  },
});
