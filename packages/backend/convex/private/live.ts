import { ConvexError } from "convex/values";
import { query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

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

    // 1) filter actives + has geo
    const active = sessions.filter(
      (s) =>
        (s.expiresAt ?? 0) > now &&
        typeof s.metadata?.lat === "number" &&
        typeof s.metadata?.lng === "number",
    );

    // 2) dedup by stable visitor key (keep the most "alive" session)
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

    // ✅ 3) Load conversations for these sessions (active/latest per session)
    const convBySessionId = new Map<string, Doc<"conversations">>();

    for (const s of deduped) {
      const conv = await ctx.db
        .query("conversations")
        .withIndex("by_contact_session_id", (q) => q.eq("contactSessionId", s._id))
        .order("desc")
        .first();

      if (conv && conv.organizationId === orgId && conv.status !== "resolved") {
        convBySessionId.set(String(s._id), conv);
      }
    }

    // ✅ 4) Collect unique rep ids from conversations
    const repIds = Array.from(
      new Set(
        Array.from(convBySessionId.values())
          .map((c) => c.assignedRepUserId)
          .filter(Boolean) as string[],
      ),
    );

    // ✅ 5) Load user profiles for reps (users table)
    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
      .collect();

    const userByExternalId = new Map<string, Doc<"users">>();
    for (const u of users) userByExternalId.set(u.externalId, u);

    // ✅ 6) Load reps presence (optional, but useful for role/regions/available)
    const repPresence = await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();

    const presenceByUserId = new Map<string, Doc<"repsPresence">>();
    for (const r of repPresence) presenceByUserId.set(r.userId, r);

    // 7) Build results
    const results: any[] = [];

    for (const s of deduped) {
      const md = s.metadata ?? {};
      const pages = Array.isArray(md.pages) ? (md.pages as string[]) : [];

      // latest snapshot by (sessionId, ts)
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

      // lastSeen should be a real timestamp, not expiresAt (future)
      const lastSeen = snapTs || now;

      const conv = convBySessionId.get(String(s._id));
      const conversationId = conv?._id ?? null;

      // ✅ Assigned rep object (profile + presence)
      let assignedRep: any = null;

      const repUserId = conv?.assignedRepUserId;
      if (repUserId) {
        const u = userByExternalId.get(repUserId);
        const p = presenceByUserId.get(repUserId);

        const avatar =
          typeof u?.avatarUrl === "string" && u.avatarUrl.trim() ? u.avatarUrl.trim() : undefined;

        assignedRep = {
          userId: repUserId,
          name: u?.name ?? undefined,
          avatarUrl: avatar,
          title: u?.title ?? p?.title ?? undefined,
          role: p?.role ?? "sales",
          regions: p?.regions ?? [],
          available: p?.available ?? undefined,
        };
      }

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

        pageCount: pages.length,
        timeOnSiteMs: now - s._creationTime,

        contactSessionId: s._id,
        conversationId,

        // ✅ NEW: rep owner visible everywhere (LiveMap, panels, contactPanel, etc.)
        assignedRep,

        lastSeen,
      });
    }

    return results;
  },
});