// packages/backend/convex/private/live.ts
import { ConvexError } from "convex/values";
import { query } from "../_generated/server";

export const getActiveVisitors = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = (identity as any)?.orgId as string | undefined;
    if (!orgId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
    }

    const now = Date.now();
    const sessions = await ctx.db
      .query("contactSessions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .collect();

    return sessions
      .filter(
        (s) =>
          s.expiresAt > now &&
          typeof s.metadata?.lat === "number" &&
          typeof s.metadata?.lng === "number"
      )
      .map((s) => {
        const md = s.metadata ?? {};
        const pages = Array.isArray(md.pages) ? (md.pages as string[]) : [];

        return {
          _id: s._id,                     // keep _id so the UI can use it as-is
          name: s.name,
          email: s.email,

          city: md.city as string | undefined,
          countryCode: md.countryCode as string | undefined,
          lat: md.lat as number,
          lng: md.lng as number,

          currentUrl: md.currentUrl as string | undefined,
          title: md.title as string | undefined,                   // NEW
          userAgent: md.userAgent as string | undefined,           // NEW
          cookieEnabled: md.cookieEnabled as boolean | undefined,  // NEW
          timezoneOffset: md.timezoneOffset as number | undefined, // NEW
          pageCount: pages.length,                                 // NEW
          timeOnSiteMs: now - s._creationTime,                     // NEW

          contactSessionId: s._id,
          conversationId: (s as any).conversationId ?? null,
          lastSeen: s.expiresAt,
        };
      });
  },
});
