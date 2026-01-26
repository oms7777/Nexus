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

    // dedup by stable visitor key
    const bestByKey = new Map<string, (typeof active)[number]>();

    const stableKeyFor = (s: any) => {
      const md = s.metadata ?? {};
      const vid =
        (s.visitorId as string | undefined) ||
        (md.visitorId as string | undefined);

      if (vid && String(vid).trim()) return `v:${String(vid)}`;

      const ext = s.externalSessionId as string | undefined;
      if (ext && String(ext).trim()) return `e:${String(ext)}`;

      return `id:${String(s._id)}`;
    };

    for (const s of active) {
      const key = stableKeyFor(s);
      const prev = bestByKey.get(key);

      if (!prev) {
        bestByKey.set(key, s);
        continue;
      }

      // keep the most alive
      if ((s.expiresAt ?? 0) > (prev.expiresAt ?? 0)) {
        bestByKey.set(key, s);
      }
    }

    const deduped = Array.from(bestByKey.values());
    const results: any[] = [];

    for (const s of deduped) {
      const md = s.metadata ?? {};

      const pages = Array.isArray((md as any).pages)
        ? ((md as any).pages as string[]).filter(Boolean)
        : [];

      // latest snapshot
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

      const currentUrl =
        snapUrl || (md.currentUrl as string | undefined) || undefined;
      const title = snapTitle || (md.title as string | undefined) || undefined;

      const lastSeen = (md as any).lastSeenAt || snapTs || s._creationTime;

      // ✅ SINGLE SOURCE OF TRUTH for Pusher channel:
      // presence-org_${orgId}_session_${contactSessionId}
      const contactSessionId = String(s._id);
      const streamSessionId = contactSessionId;

      const externalSessionId = (s as any).externalSessionId as
        | string
        | undefined;

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

        contactSessionId, // string
        streamSessionId,  // ✅ same

        externalSessionId: externalSessionId ?? null,
        conversationId: (s as any).conversationId ?? null,
        lastSeen,
      });
    }

    return results;
  },
});