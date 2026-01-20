// packages/backend/convex/private/live.ts
import { ConvexError } from "convex/values";
import { query } from "../_generated/server";

export const getActiveVisitors = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = (identity as any)?.orgId as string | undefined;

    if (!orgId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Organization not found",
      });
    }

    const now = Date.now();

    const sessions = await ctx.db
      .query("contactSessions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .collect();

    const active = sessions.filter(
      (s) =>
        (s.expiresAt ?? 0) > now &&
        typeof s.metadata?.lat === "number" &&
        typeof s.metadata?.lng === "number",
    );

    const bestByKey = new Map<string, (typeof active)[number]>();

    for (const s of active) {
      const md = s.metadata ?? {};
      const key =
        (md.visitorId as string | undefined) ||
        (s.externalSessionId as string | undefined) ||
        String(s._id);

      const prev = bestByKey.get(key);
      if (!prev) {
        bestByKey.set(key, s);
        continue;
      }

      if ((s.expiresAt ?? 0) > (prev.expiresAt ?? 0)) {
        bestByKey.set(key, s);
      }
    }

    const deduped = Array.from(bestByKey.values());
    const results: any[] = [];

    for (const s of deduped) {
      const md = s.metadata ?? {};
      const pages = Array.isArray(md.pages) ? (md.pages as string[]) : [];

      // (Optional) latest snapshot as source of truth for currentUrl/title
      let snapUrl: string | undefined;
      let snapTitle: string | undefined;
      let snapTs: number | undefined;

      try {
        const latestSnap = await ctx.db
          .query("sessionSnapshots")
          .withIndex("by_session_ts", (q) => q.eq("sessionId", s._id))
          .order("desc")
          .first();

        if (latestSnap) {
          snapUrl = latestSnap.pageUrl ?? undefined;
          snapTitle = latestSnap.title ?? undefined;
          snapTs = latestSnap.ts ?? undefined;
        }
      } catch {}

      const currentUrl = snapUrl || (md.currentUrl as string | undefined) || undefined;
      const title = snapTitle || (md.title as string | undefined) || undefined;

      const lastSeen = (md as any).lastSeenAt || snapTs || s._creationTime;

      results.push({
        _id: s._id,
        name: s.name,
        email: s.email,

        city: md.city as string | undefined,
        countryCode: md.countryCode as string | undefined,
        lat: md.lat as number,
        lng: md.lng as number,

        currentUrl,
        title,

        pages, // ✅ add this

        userAgent: md.userAgent as string | undefined,
        cookieEnabled: md.cookieEnabled as boolean | undefined,
        timezoneOffset: md.timezoneOffset as number | undefined,

        pageCount: pages.length,
        timeOnSiteMs: now - s._creationTime,

        contactSessionId: s._id,
        conversationId: (s as any).conversationId ?? null,

        lastSeen,
      });
    }

    return results;
  },
});
