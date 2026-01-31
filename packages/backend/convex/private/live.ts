// packages/backend/convex/private/live.ts
import { ConvexError } from "convex/values";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export const getActiveVisitors = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = (identity as any)?.orgId as string | undefined;
    const myUserId = (identity as any)?.subject as string | undefined;

    if (!orgId || !myUserId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const now = Date.now();

    // ✅ my presence => my territories
    const myPresence = await ctx.db
      .query("repsPresence")
      .withIndex("by_org_user", (q) => q.eq("organizationId", orgId).eq("userId", myUserId))
      .unique();

    const myTerritories: string[] = Array.isArray(myPresence?.regions)
      ? (myPresence!.regions as string[])
      : [];

    // ✅ territories mapping (countryCode -> territoryKey)
    const territories = await ctx.db
      .query("territories")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();

    const countryToTerritory = new Map<string, string>();
    for (const t of territories) {
      const codes = Array.isArray(t.countryCodes) ? t.countryCodes : [];
      for (const c of codes) {
        if (typeof c === "string" && c.trim()) {
          countryToTerritory.set(c.trim().toUpperCase(), t.key);
        }
      }
    }

    // sessions
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

    // dedupe
    const bestByKey = new Map<string, (typeof active)[number]>();
    for (const s of active) {
      const md = s.metadata ?? {};
      const key =
        (md.visitorId as string | undefined) ||
        (s.externalSessionId as string | undefined) ||
        String(s._id);

      const prev = bestByKey.get(key);
      if (!prev || (s.expiresAt ?? 0) > (prev.expiresAt ?? 0)) {
        bestByKey.set(key, s);
      }
    }
    const deduped = Array.from(bestByKey.values());

    // latest active conversation per session
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

    // users in org
    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
      .collect();

    const userByExternalId = new Map<string, Doc<"users">>();
    for (const u of users) userByExternalId.set(u.externalId, u);

    // repsPresence
    const repPresence = await ctx.db
      .query("repsPresence")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();

    const presenceByUserId = new Map<string, Doc<"repsPresence">>();
    for (const r of repPresence) presenceByUserId.set(r.userId, r);

    const results: any[] = [];

    for (const s of deduped) {
      const md = s.metadata ?? {};
      const pages = Array.isArray(md.pages) ? (md.pages as string[]) : [];

      // latest snapshot for URL/title
      let snapUrl: string | undefined;
      let snapTitle: string | undefined;
      let snapTs: number | undefined;

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

      const currentUrl = snapUrl || (md.currentUrl as string | undefined) || undefined;
      const title = snapTitle || (md.title as string | undefined) || undefined;
      const lastSeen = snapTs || now;

      const conv = convBySessionId.get(String(s._id));
      const conversationId = conv?._id ?? null;

      // assignment sources
      const repUserId =
        (conv?.assignedRepUserId as string | undefined) ||
        (s.assignedRepUserId as string | undefined) ||
        undefined;

      // ✅ territoryKey: conversation > session > fallback country mapping
      let territoryKey =
        (conv?.assignedTerritoryKey as string | undefined) ||
        (s.assignedTerritoryKey as string | undefined) ||
        undefined;

      if (!territoryKey) {
        const cc = (md.countryCode as string | undefined)?.toUpperCase();
        if (cc) territoryKey = countryToTerritory.get(cc);
      }

      // ✅ filter visibility
      const isAssignedToMe = repUserId === myUserId;
      const isInMyTerritory =
        Boolean(territoryKey) && myTerritories.includes(String(territoryKey));

      const canSee =
        myTerritories.length > 0 ? (isInMyTerritory || isAssignedToMe) : isAssignedToMe;

      if (!canSee) continue;

      let assignedRep: any = null;
      if (repUserId) {
        const u = userByExternalId.get(repUserId);
        const p = presenceByUserId.get(repUserId);

        const avatar =
          typeof u?.avatarUrl === "string" && u.avatarUrl.trim()
            ? u.avatarUrl.trim()
            : undefined;

        assignedRep = {
          userId: repUserId,
          name: u?.name ?? undefined,
          avatarUrl: avatar,
          title: u?.title ?? p?.title ?? undefined,
          regions: p?.regions ?? [],
          available: p?.available ?? undefined,
          territoryKey,
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

        pageCount: pages.length,
        timeOnSiteMs: now - s._creationTime,

        contactSessionId: s._id as Id<"contactSessions">,
        conversationId,

        assignedRep,
        assignedTerritoryKey: territoryKey,

        lastSeen,
      });
    }

    return results;
  },
});
