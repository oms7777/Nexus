// packages/backend/convex/public/bookings.ts
import { mutation } from "../_generated/server";
import { v } from "convex/values";

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
        phone: v.optional(v.string()), // ✅ NEW
      })
    ),
  },
  handler: async (ctx, args) => {
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
      providerData: args.providerData,
      createdAt: Date.now(),
    });
  },
});
