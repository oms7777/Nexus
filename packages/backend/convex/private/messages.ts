// convex/private/messages.ts
import { ConvexError, v } from "convex/values";
import { generateText } from "ai";
import { action, mutation, query } from "../_generated/server";
import { components, internal, api } from "../_generated/api";
import { supportAgent } from "../system/ai/agents/supportAgent";
import { paginationOptsValidator } from "convex/server";
import { saveMessage } from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import { OPERATOR_MESSAGE_ENHANCEMENT_PROMPT } from "../system/ai/constants";

export const enhanceResponse = action({
  args: { prompt: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });
    }

    const orgId = identity.orgId as string;
    if (!orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
    }

    const subscription = await ctx.runQuery(
      internal.system.subscriptions.getByOrganizationId,
      { organizationId: orgId },
    );

    if (subscription?.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Missing subscription" });
    }

    const response = await generateText({
      model: openai("gpt-4o-mini"),
      messages: [
        { role: "system", content: OPERATOR_MESSAGE_ENHANCEMENT_PROMPT },
        { role: "user", content: args.prompt },
      ],
    });

    return response.text;
  },
});

export const create = mutation({
  args: {
    prompt: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });
    }

    const orgId = identity.orgId as string;
    if (!orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
    }

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Conversation not found" });
    }

    if (conversation.organizationId !== orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid Organization ID" });
    }

    if (conversation.status === "resolved") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Conversation resolved" });
    }

    const now = Date.now();

    // 1) If first operator response: log inbound_rep_started + SLA check
    //    We detect "first" by checking if inbound_rep_started already exists for this conversation.
    const alreadyStarted = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .filter((q) => q.eq(q.field("type"), "inbound_rep_started"))
      .first();

    if (!alreadyStarted) {
      // Find inbound start timestamp: prefer inbound_chat_requested, fallback conversation_created
      const inboundReq = await ctx.db
        .query("analyticsEvents")
        .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
        .filter((q) => q.eq(q.field("type"), "inbound_chat_requested"))
        .order("asc")
        .first();

      const convCreated = await ctx.db
        .query("analyticsEvents")
        .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
        .filter((q) => q.eq(q.field("type"), "conversation_created"))
        .order("asc")
        .first();

      const startTs = (inboundReq?.ts ?? convCreated?.ts ?? now) as number;

      // SLA seconds from widget settings (fallback 120s)
      const widgetSettings = await ctx.db
        .query("widgetSettings")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
        .unique();

      const slaSeconds = Number((widgetSettings as any)?.slaSeconds ?? 120);
      const dtSec = Math.max(0, Math.round((now - startTs) / 1000));
      const withinSla = Number.isFinite(slaSeconds) ? dtSec <= slaSeconds : false;

      // ✅ log inbound_rep_started
      await ctx.runMutation(api.public.analytics.log, {
        organizationId: orgId,
        type: "inbound_rep_started",
        ts: now,
        userId: identity.subject, // Clerk userId
        sessionId: conversation.contactSessionId,
        conversationId: conversation._id,
        meta: {
          responseTimeSec: dtSec,
          slaSeconds,
          withinSla,
        },
      });

      // ✅ log started_before_sla if ok
      if (withinSla) {
        await ctx.runMutation(api.public.analytics.log, {
          organizationId: orgId,
          type: "inbound_started_before_sla",
          ts: now,
          userId: identity.subject,
          sessionId: conversation.contactSessionId,
          conversationId: conversation._id,
          meta: { responseTimeSec: dtSec, slaSeconds },
        });
      }
    }

    // 2) Save operator message first so escalation digest (Slack/email) includes this reply
    await saveMessage(ctx, components.agent, {
      threadId: conversation.threadId,
      agentName: identity.familyName,
      message: { role: "assistant", content: args.prompt },
    });

    // 3) Auto escalate (business rule) — same path as AI tool (routing + Slack/email digest once)
    if (conversation.status === "unresolved") {
      await ctx.runMutation(internal.system.conversations.escalate, {
        threadId: conversation.threadId,
      });
    }
  },
});

export const getMany = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });
    }

    const orgId = identity.orgId as string;
    if (!orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
    }

    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique();

    if (!conversation) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Conversation not found" });
    }

    if (conversation.organizationId !== orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid Organization ID" });
    }

    return await supportAgent.listMessages(ctx, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
  },
});
