// packages/backend/convex/private/conversations.ts
import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { supportAgent } from "../system/ai/agents/supportAgent";
import { MessageDoc } from "@convex-dev/agent";
import { paginationOptsValidator, PaginationResult } from "convex/server";
import { Doc } from "../_generated/dataModel";

/**
 * Email / deep links: Clerk's active org in the JWT may differ from the conversation's org.
 * Allow read when the signed-in user is a member of that org (`users` or `repsPresence`).
 */
async function userCanAccessOrganization(
  ctx: QueryCtx,
  organizationId: string,
  clerkSubject: string,
  jwtOrgId: string | undefined,
): Promise<boolean> {
  if (jwtOrgId != null && jwtOrgId === organizationId) {
    return true;
  }

  const userRow = await ctx.db
    .query("users")
    .withIndex("by_org_external", (q) =>
      q.eq("organizationId", organizationId).eq("externalId", clerkSubject),
    )
    .first();
  if (userRow) return true;

  const repRow = await ctx.db
    .query("repsPresence")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", clerkSubject),
    )
    .first();
  return repRow != null;
}

export const updateStatus = mutation({
  args: {
    conversationId: v.id("conversations"),
    status: v.union(v.literal("unresolved"), v.literal("escalated"), v.literal("resolved")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });

    const orgId = (identity as any).orgId as string | undefined;
    const meUserId = (identity as any).subject as string | undefined;

    if (!orgId || !meUserId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new ConvexError({ code: "NOT_FOUND", message: "Conversation not found" });

    if (conversation.organizationId !== orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid Organization ID" });
    }

    // ✅ REP STRICT: only owner rep can update
    if ((conversation.assignedRepUserId ?? null) !== meUserId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Not your conversation" });
    }

    await ctx.db.patch(args.conversationId, { status: args.status });
  },
});

export const getOne = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    try {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new ConvexError("UNAUTHORIZED: identity not found");

      const jwtOrgId = (identity as any).orgId as string | undefined;
      const meUserId = (identity as any).subject as string | undefined;

      if (!meUserId) {
        throw new ConvexError("UNAUTHORIZED: missing subject");
      }

      const conversation = await ctx.db.get(args.conversationId);
      if (!conversation) throw new ConvexError("NOT_FOUND: conversation not found");

      const allowed = await userCanAccessOrganization(
        ctx,
        conversation.organizationId,
        meUserId,
        jwtOrgId,
      );
      if (!allowed) {
        throw new ConvexError("UNAUTHORIZED: invalid organization");
      }

    /**
     * Deep link / email: any authenticated user in the org can open a conversation.
     * The inbox list (`getMany`) stays scoped to the assigned rep so reps only see their queue.
     */
      const contactSession = await ctx.db.get(conversation.contactSessionId);
      if (!contactSession) throw new ConvexError("NOT_FOUND: contact session not found");

      return {
        ...conversation,
        contactSession,
        assignedRepUserId: conversation.assignedRepUserId ?? null,
        assignedTerritoryKey: conversation.assignedTerritoryKey ?? null,
      };
    } catch (err: unknown) {
      // Make client-visible errors readable (Convex shows "Server Error" for non-string payloads).
      // Also log full context server-side for debugging deep-link failures.
      console.error("private/conversations:getOne failed", {
        conversationId: args.conversationId,
        err,
      });
      if (err instanceof ConvexError) throw err;
      throw new ConvexError("SERVER_ERROR: getOne failed");
    }
  },
});

const statusValidator = v.union(v.literal("unresolved"), v.literal("escalated"), v.literal("resolved"));

export const getMany = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(statusValidator),
    statusIn: v.optional(v.array(statusValidator)),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });

    const orgId = (identity as any).orgId as string | undefined;
    const meUserId = (identity as any).subject as string | undefined;

    if (!orgId || !meUserId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    let conversations: PaginationResult<Doc<"conversations">>;

    // ✅ REP STRICT: always filter by assignedRepUserId
    if (args.status && !args.statusIn) {
      // No perfect compound index (status + org + rep) in schema, so:
      // - paginate by status+org
      // - then filter in memory
      // If you want perfect perf later: add index by (organizationId, assignedRepUserId, status).
      const base = await ctx.db
        .query("conversations")
        .withIndex("by_status_and_organization_id", (q) =>
          q.eq("status", args.status as Doc<"conversations">["status"]).eq("organizationId", orgId)
        )
        .order("desc")
        .paginate(args.paginationOpts);

      const filtered = base.page.filter((c) => (c.assignedRepUserId ?? null) === meUserId);
      conversations = { ...base, page: filtered };
    } else {
      conversations = await ctx.db
        .query("conversations")
        .withIndex("by_org_assigned_rep", (q) => q.eq("organizationId", orgId).eq("assignedRepUserId", meUserId))
        .order("desc")
        .paginate(args.paginationOpts);
      if (args.statusIn?.length) {
        const allowed = new Set(args.statusIn);
        conversations = { ...conversations, page: conversations.page.filter((c) => allowed.has(c.status)) };
      }
    }

    const conversationsWithAdditionalData = await Promise.all(
      conversations.page.map(async (conversation) => {
        let lastMessage: MessageDoc | null = null;

        const contactSession = await ctx.db.get(conversation.contactSessionId);
        if (!contactSession) return null;

        const messages = await supportAgent.listMessages(ctx, {
          threadId: conversation.threadId,
          paginationOpts: { numItems: 1, cursor: null },
        });

        if (messages.page.length > 0) lastMessage = messages.page[0] ?? null;

        return {
          ...conversation,
          lastMessage,
          contactSession,
          assignedRepUserId: conversation.assignedRepUserId ?? null,
          assignedTerritoryKey: conversation.assignedTerritoryKey ?? null,
        };
      })
    );

    const validConversations = conversationsWithAdditionalData.filter(
      (conv): conv is NonNullable<typeof conv> => conv !== null
    );

    return {
      ...conversations,
      page: validConversations,
    };
  },
});

export const countMineByStatus = query({
  args: {
    status: v.union(v.literal("unresolved"), v.literal("escalated"), v.literal("resolved")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });

    const orgId = (identity as any).orgId as string | undefined;
    const meUserId = (identity as any).subject as string | undefined;
    if (!orgId || !meUserId) throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });

    // ✅ fast path if you have by_org_assigned_rep index
    // but need status filter => do it in memory unless you add compound index
    const base = await ctx.db
      .query("conversations")
      .withIndex("by_org_assigned_rep", (q) => q.eq("organizationId", orgId).eq("assignedRepUserId", meUserId))
      .collect();

    return base.filter((c) => c.status === args.status).length;
  },
});

export const countUnseenEscalated = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });

    const orgId = (identity as any).orgId as string | undefined;
    const meUserId = (identity as any).subject as string | undefined;
    if (!orgId || !meUserId) throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });

    const base = await ctx.db
      .query("conversations")
      .withIndex("by_org_assigned_rep", (q) => q.eq("organizationId", orgId).eq("assignedRepUserId", meUserId))
      .collect();

    return base.filter(
      (c) =>
        c.status === "escalated" &&
        (c.lastViewedByRepUserId !== meUserId || c.lastViewedByRepAt == null)
    ).length;
  },
});

export const remove = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });

    const orgId = (identity as any).orgId as string | undefined;
    const meUserId = (identity as any).subject as string | undefined;
    if (!orgId || !meUserId) throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });

    const conv = await ctx.db.get(args.conversationId);
    if (!conv) return;
    if (conv.organizationId !== orgId) throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid org" });
    if ((conv.assignedRepUserId ?? null) !== meUserId) throw new ConvexError({ code: "UNAUTHORIZED", message: "Not your conversation" });

    await ctx.db.delete(args.conversationId);
  },
});

export const markViewed = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });

    const orgId = (identity as any).orgId as string | undefined;
    const meUserId = (identity as any).subject as string | undefined;
    if (!orgId || !meUserId) throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });

    const conv = await ctx.db.get(args.conversationId);
    if (!conv) return;
    if (conv.organizationId !== orgId) return;
    if ((conv.assignedRepUserId ?? null) !== meUserId) return;

    await ctx.db.patch(args.conversationId, {
      lastViewedByRepUserId: meUserId,
      lastViewedByRepAt: Date.now(),
    });
  },
});