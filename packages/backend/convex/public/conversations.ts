// convex/public/conversations.ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { api, components, internal } from "../_generated/api";
import { supportAgent } from "../system/ai/agents/supportAgent";
import { saveMessage, type MessageDoc } from "@convex-dev/agent";

type RoutingMode = "auto_assign" | "visitor_choice";

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

    // Refresh TTL
    await ctx.runMutation(internal.system.contactSessions.refresh, {
      contactSessionId: args.contactSessionId,
    });

    // Load widget settings (needed for greet + routingMode)
    const widgetSettings = await ctx.db
      .query("widgetSettings")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    const routingMode: RoutingMode = (widgetSettings?.routingMode ?? "auto_assign") as RoutingMode;

    // Reuse existing active (idempotent)
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
      // ✅ If we’re in auto_assign and the old conv has no rep owner yet, backfill it once
      if (routingMode === "auto_assign" && !existingActive.assignedRepUserId) {
        const picked = await ctx.runQuery(api.public.routing.pickRepForVisitor, {
          organizationId: args.organizationId,
          contactSessionId: args.contactSessionId,
        });

        if (picked?.userId) {
          await ctx.db.patch(existingActive._id, { assignedRepUserId: picked.userId });
        }
      }

      await ctx.runMutation(api.public.analytics.log, {
        organizationId: args.organizationId,
        type: "experience_shown",
        sessionId: args.contactSessionId,
        conversationId: existingActive._id,
        meta: {
          threadId: existingActive.threadId,
          reused: true,
          suppressGreet: !!args.suppressGreet,
        },
      });

      await ctx.runMutation(api.public.analytics.log, {
        organizationId: args.organizationId,
        type: "conversation_reused",
        sessionId: args.contactSessionId,
        conversationId: existingActive._id,
        meta: { threadId: existingActive.threadId },
      });

      return { conversationId: existingActive._id, threadId: existingActive.threadId };
    }

    // ✅ Decide assigned rep for this conversation
    // visitor_choice => owner = preferredRepUserId (if any), otherwise undefined (no auto)
    // auto_assign    => owner = routing.pickRepForVisitor (rules/territories/presence)
    let assignedRepUserId: string | undefined;

    if (routingMode === "visitor_choice") {
      const preferred = session.metadata?.preferredRepUserId as string | undefined;
      if (preferred && preferred.trim()) assignedRepUserId = preferred.trim();
    } else {
      const picked = await ctx.runQuery(api.public.routing.pickRepForVisitor, {
        organizationId: args.organizationId,
        contactSessionId: args.contactSessionId,
      });
      if (picked?.userId) assignedRepUserId = picked.userId;
    }

    const { threadId } = await supportAgent.createThread(ctx, {
      userId: args.organizationId,
    });

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

      // ✅ persist owner
      assignedRepUserId,
    });

    await ctx.runMutation(api.public.analytics.log, {
      organizationId: args.organizationId,
      type: "experience_shown",
      sessionId: args.contactSessionId,
      conversationId,
      meta: { threadId, suppressGreet: !!args.suppressGreet, assignedRepUserId },
    });

    await ctx.runMutation(api.public.analytics.log, {
      organizationId: args.organizationId,
      type: "conversation_created",
      sessionId: args.contactSessionId,
      conversationId,
      meta: { threadId, suppressGreet: !!args.suppressGreet, assignedRepUserId },
    });

    return { conversationId, threadId };
  },
});