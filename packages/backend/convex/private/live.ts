// packages/backend/convex/private/live.ts
import { ConvexError } from "convex/values";
import { query } from "../_generated/server";

const ACTIVE_WINDOW_MS = 90_000; // ✅ disparaît vite si offline (90s)

function getLastSeenMs(s: any) {
  const md = s.metadata ?? {};
  const mdSeen =
    typeof md.lastSeenAt === "number" ? md.lastSeenAt :
    typeof s.lastSeenAt === "number" ? s.lastSeenAt :
    typeof s._creationTime === "number" ? s._creationTime :
    0;
  return mdSeen;
}

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

    // ✅ Active = lastSeenAt within window + has geo
    const active = sessions.filter((s) => {
      const md = s.metadata ?? {};
      const seen = getLastSeenMs(s);
      const isRecent = seen > now - ACTIVE_WINDOW_MS;
      const hasGeo = typeof md.lat === "number" && typeof md.lng === "number";
      return isRecent && hasGeo;
    });

    // ✅ dedup by stable visitor key (keep most recently seen)
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

      const prevSeen = getLastSeenMs(prev);
      const curSeen = getLastSeenMs(s);

      if (curSeen > prevSeen) bestByKey.set(key, s);
    }

    const deduped = Array.from(bestByKey.values());

    // Override currentUrl/title using latest sessionSnapshots (source of truth)
    const results: any[] = [];

    for (const s of deduped) {
      const md = s.metadata ?? {};

      const pages = Array.isArray((md as any).pages)
        ? ((md as any).pages as string[]).filter(Boolean)
        : [];

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
      } catch {
        // ignore
      }

      const currentUrl = snapUrl || (md.currentUrl as string | undefined) || undefined;
      const title = snapTitle || (md.title as string | undefined) || undefined;

      const lastSeen = Math.max(getLastSeenMs(s), snapTs ?? 0);

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

        userAgent: md.userAgent as string | undefined,
        cookieEnabled: md.cookieEnabled as boolean | undefined,
        timezoneOffset: md.timezoneOffset as number | undefined,

        pages,
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