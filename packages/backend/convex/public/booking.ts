// packages/backend/convex/public/bookings.ts
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/** Widest meeting length we look back for when scanning for overlaps. */
const MAX_MEETING_MS = 4 * 60 * 60 * 1000;

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && aEnd > bStart;

/**
 * Bookings that could collide with [start, end) for one org.
 * Bounded by the `by_org_start` index so this stays cheap.
 */
async function bookingsNearSlot(
  ctx: { db: any },
  organizationId: string,
  start: number,
  end: number,
): Promise<Array<Doc<"calendarBookings">>> {
  return await ctx.db
    .query("calendarBookings")
    .withIndex("by_org_start", (q: any) =>
      q.eq("organizationId", organizationId).gte("start", start - MAX_MEETING_MS).lte("start", end),
    )
    .collect();
}

/**
 * Lets the caller short-circuit before touching the calendar provider,
 * so a retry or a double click never creates a second external event.
 */
export const findExistingForSlot = query({
  args: {
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
    start: v.number(),
    end: v.number(),
    createdByUserId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"calendarBookings"> | null> => {
    const candidates = await bookingsNearSlot(ctx, args.organizationId, args.start, args.end);

    return (
      candidates.find(
        (b) =>
          b.contactSessionId === args.contactSessionId &&
          b.start === args.start &&
          (args.createdByUserId == null || b.createdByUserId === args.createdByUserId),
      ) ?? null
    );
  },
});

/**
 * CRM ids land after the booking row exists, because the CRM calls are
 * fire-and-forget and must never block a confirmed meeting.
 */
export const attachCrmIds = internalMutation({
  args: {
    bookingId: v.id("calendarBookings"),
    salesforceLeadId: v.optional(v.string()),
    salesforceEventId: v.optional(v.string()),
    hubspotContactId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return;

    const prev = booking.crm ?? {};
    await ctx.db.patch(args.bookingId, {
      crm: {
        salesforceLeadId: args.salesforceLeadId ?? prev.salesforceLeadId,
        salesforceEventId: args.salesforceEventId ?? prev.salesforceEventId,
        hubspotContactId: args.hubspotContactId ?? prev.hubspotContactId,
      },
    });
  },
});

export const create = mutation({
  args: {
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
    attendeeName: v.string(),
    attendeeEmail: v.string(),
    start: v.number(),
    end: v.number(),
    createdByUserId: v.optional(v.string()),
    meetingUrl: v.optional(v.string()),
    externalEventId: v.optional(v.string()),
    providerData: v.optional(
      v.object({
        calendarId: v.optional(v.string()),
        company: v.optional(v.string()),
        role: v.optional(v.string()),
        phone: v.optional(v.string()),
        description: v.optional(v.string()), // ✅ NEW
      })
    ),
  },
  handler: async (ctx, args) => {
    const nearby = await bookingsNearSlot(ctx, args.organizationId, args.start, args.end);

    // Same visitor, same slot, same rep: treat as a retry and keep the first booking.
    const duplicate = nearby.find(
      (b) =>
        b.contactSessionId === args.contactSessionId &&
        b.start === args.start &&
        b.createdByUserId === args.createdByUserId,
    );
    if (duplicate) return duplicate._id;

    // Someone else already holds an overlapping slot on this rep's calendar.
    // Checked inside the mutation so concurrent bookings cannot both pass.
    if (args.createdByUserId) {
      const conflict = nearby.find(
        (b) =>
          b.createdByUserId === args.createdByUserId &&
          overlaps(args.start, args.end, b.start, b.end),
      );
      if (conflict) {
        throw new ConvexError({
          code: "SLOT_TAKEN",
          message: "This time slot has just been booked. Please pick another one.",
        });
      }
    }

    return await ctx.db.insert("calendarBookings", {
      organizationId: args.organizationId,
      contactSessionId: args.contactSessionId,
      attendeeName: args.attendeeName,
      attendeeEmail: args.attendeeEmail,
      start: args.start,
      end: args.end,
      createdByUserId: args.createdByUserId,
      meetingUrl: args.meetingUrl,
      externalEventId: args.externalEventId,
      providerData: args.providerData, // ✅ now includes description
      createdAt: Date.now(),
    });
  },
});
