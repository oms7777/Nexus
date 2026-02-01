// packages/backend/convex/private/conversations.ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { supportAgent } from "../system/ai/agents/supportAgent";
import { MessageDoc } from "@convex-dev/agent";
import { paginationOptsValidator, PaginationResult } from "convex/server";
import { Doc } from "../_generated/dataModel";

function requireIdentity(identity: any) {
  if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Identity not found" });

  const orgId = (identity as any).orgId as string | undefined;
  const meUserId = (identity as any).subject as string | undefined;

  if (!orgId) throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
  if (!meUserId) throw new ConvexError({ code: "UNAUTHORIZED", message: "User not found" });

  return { orgId, meUserId };
}

async function getMyRegions(ctx: any, orgId: string, meUserId: string): Promise<string[]> {
  const presence = await ctx.db
    .query("repsPresence")
    .withIndex("by_org_user", (q: any) => q.eq("organizationId", orgId).eq("userId", meUserId))
    .unique();

  return Array.isArray(presence?.regions) ? (presence.regions as string[]) : [];
}

/**
 * Visibility rules (single source of truth):
 * 1) If assignedRepUserId exists => ONLY that rep can see
 * 2) If not assigned => visible only if assignedTerritoryKey matches my regions
 * 3) If I have no regions => I see only explicitly assigned to me
 */
function canSeeConversation(params: {
  meUserId: string;
  myRegions: string[];
  conversationAssignedRep?: string;
  territoryKey?: string | null;
}) {
  const { meUserId, myRegions, conversationAssignedRep, territoryKey } = params;

  if (conversationAssignedRep) {
    return conversationAssignedRep === meUserId;
  }

  // Not assigned => territory visibility only
  if (!myRegions.length) return false;

  if (!territoryKey) return false;
  return myRegions.includes(territoryKey);
}

export const updateStatus = mutation({
  args: {
    conversationId: v.id("conversations"),
    status: v.union(v.literal("unresolved"), v.literal("escalated"), v.literal("resolved")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const { orgId, meUserId } = requireIdentity(identity);

    const myRegions = await getMyRegions(ctx, orgId, meUserId);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new ConvexError({ code: "NOT_FOUND", message: "Conversation not found" });

    if (conversation.organizationId !== orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid Organization ID" });
    }

    const contactSession = await ctx.db.get(conversation.contactSessionId);
    if (!contactSession) throw new ConvexError({ code: "NOT_FOUND", message: "Contact Session not found" });

    const territoryKey =
      (conversation.assignedTerritoryKey as string | undefined) ||
      (contactSession.assignedTerritoryKey as string | undefined) ||
      null;

    const ok = canSeeConversation({
      meUserId,
      myRegions,
      conversationAssignedRep: conversation.assignedRepUserId as string | undefined,
      territoryKey,
    });

    if (!ok) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Not allowed" });
    }

    await ctx.db.patch(args.conversationId, { status: args.status });
  },
});

export const getOne = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const { orgId, meUserId } = requireIdentity(identity);

    const myRegions = await getMyRegions(ctx, orgId, meUserId);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new ConvexError({ code: "NOT_FOUND", message: "Conversation not found" });

    if (conversation.organizationId !== orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid Organization ID" });
    }

    const contactSession = await ctx.db.get(conversation.contactSessionId);
    if (!contactSession) throw new ConvexError({ code: "NOT_FOUND", message: "Contact Session not found" });

    const territoryKey =
      (conversation.assignedTerritoryKey as string | undefined) ||
      (contactSession.assignedTerritoryKey as string | undefined) ||
      null;

    const ok = canSeeConversation({
      meUserId,
      myRegions,
      conversationAssignedRep: conversation.assignedRepUserId as string | undefined,
      territoryKey,
    });

    if (!ok) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Not allowed" });
    }

    return {
      ...conversation,
      contactSession,
      assignedRepUserId: conversation.assignedRepUserId ?? null,
      assignedTerritoryKey: territoryKey,
    };
  },
});

export const getMany = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(v.literal("unresolved"), v.literal("escalated"), v.literal("resolved"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const { orgId, meUserId } = requireIdentity(identity);

    const myRegions = await getMyRegions(ctx, orgId, meUserId);

    let conversations: PaginationResult<Doc<"conversations">>;

    if (args.status) {
      conversations = await ctx.db
        .query("conversations")
        .withIndex("by_status_and_organization_id", (q) =>
          q.eq("status", args.status as Doc<"conversations">["status"]).eq("organizationId", orgId)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      conversations = await ctx.db
        .query("conversations")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    const page = await Promise.all(
      conversations.page.map(async (conversation) => {
        const contactSession = await ctx.db.get(conversation.contactSessionId);
        if (!contactSession) return null;

        const territoryKey =
          (conversation.assignedTerritoryKey as string | undefined) ||
          (contactSession.assignedTerritoryKey as string | undefined) ||
          null;

        const ok = canSeeConversation({
          meUserId,
          myRegions,
          conversationAssignedRep: conversation.assignedRepUserId as string | undefined,
          territoryKey,
        });

        if (!ok) return null;

        let lastMessage: MessageDoc | null = null;
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
          assignedTerritoryKey: territoryKey,
        };
      })
    );

    const filtered = page.filter((x): x is NonNullable<typeof x> => x !== null);

    return { ...conversations, page: filtered };
  },
});
