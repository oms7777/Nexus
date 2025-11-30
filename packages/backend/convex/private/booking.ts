// packages/backend/convex/private/booking.ts
import { query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";

type Auth = { orgId: string; userId: string };

async function getAuth(ctx: any): Promise<Auth> {
  const id = await ctx.auth.getUserIdentity();
  if (!id) throw new ConvexError("UNAUTHENTICATED");
  const orgId = (id as any).orgId as string | undefined;
  if (!orgId) throw new ConvexError("NO_ORG");
  return { orgId, userId: id.subject as string };
}

/**
 * Liste des meetings futurs pour le rep connecté
 */
export const listMine = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const { orgId, userId } = await getAuth(ctx);
    const now = Date.now();

    const q = ctx.db
      .query("calendarBookings")
      .withIndex("by_org_start", (q) =>
        q.eq("organizationId", orgId).gte("start", now)
      )
      .filter((q) => q.eq(q.field("createdByUserId"), userId));

    // tri chronologique + limite
    const bookings: Doc<"calendarBookings">[] = await q
      .order("asc")
      .take(limit ?? 50);

    return bookings;
  },
});
