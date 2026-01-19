// packages/backend/convex/private/calendar.ts
import { query, mutation, action } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { api } from "../_generated/api";

/* ---------------- Helpers ---------------- */
type Auth = { orgId: string; userId: string };
async function getAuth(ctx: any): Promise<Auth> {
  const id = await ctx.auth.getUserIdentity();
  if (!id) throw new ConvexError("UNAUTHENTICATED");
  const orgId = (id as any).orgId as string | undefined;
  if (!orgId) throw new ConvexError("NO_ORG");
  return { orgId, userId: id.subject as string };
}

/* =======================================================================
 * Accounts (Google Calendar OAuth)
 * ===================================================================== */
export const meConnection = query({
  args: {},
  handler: async (ctx): Promise<Doc<"calendarAccounts"> | null> => {
    const { orgId, userId } = await getAuth(ctx);
    return await ctx.db
      .query("calendarAccounts")
      .withIndex("by_org_user", (q) => q.eq("organizationId", orgId).eq("userId", userId))
      .unique();
  },
});

export const accountForUser = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }): Promise<Doc<"calendarAccounts"> | null> => {
    const { orgId } = await getAuth(ctx);
    return await ctx.db
      .query("calendarAccounts")
      .withIndex("by_org_user", (q) => q.eq("organizationId", orgId).eq("userId", userId))
      .unique();
  },
});

export const saveGoogleAccount = mutation({
  args: {
    email: v.string(),
    refreshToken: v.string(),
    scope: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"calendarAccounts">> => {
    const { orgId, userId } = await getAuth(ctx);
    const existing = await ctx.db
      .query("calendarAccounts")
      .withIndex("by_org_user", (q) => q.eq("organizationId", orgId).eq("userId", userId))
      .unique();

    const doc = {
      organizationId: orgId,
      userId,
      provider: "google" as const,
      email: args.email,
      refreshToken: args.refreshToken,
      scope: args.scope,
      connectedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }
    return await ctx.db.insert("calendarAccounts", doc);
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const { orgId, userId } = await getAuth(ctx);
    const existing = await ctx.db
      .query("calendarAccounts")
      .withIndex("by_org_user", (q) => q.eq("organizationId", orgId).eq("userId", userId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** ACTION (auth): refresh_token -> access_token */
export const getAccessToken = action({
  args: { userId: v.string() },
  handler: async (
    ctx,
    { userId }
  ): Promise<{ accessToken: string; expiresIn: number }> => {
    await getAuth(ctx);
    const acct = await ctx.runQuery(api.private.calendar.accountForUser, { userId });
    if (!acct) throw new ConvexError("NO_CONNECTION");

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new ConvexError("GOOGLE_OAUTH_NOT_CONFIGURED");

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: acct.refreshToken,
    });

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const json = (await res.json()) as any;
    if (!res.ok || !json.access_token) {
      throw new ConvexError(json.error || json.error_description || "TOKEN_EXCHANGE_FAILED");
    }
    return { accessToken: String(json.access_token), expiresIn: Number(json.expires_in ?? 3600) };
  },
});

/* =======================================================================
 * Settings (B-version: durationMin, bufferMin, weekly, manualUrl…)
 * ===================================================================== */
export const mySettings = query({
  args: {},
  handler: async (ctx): Promise<Doc<"calendarSettings"> | null> => {
    const { orgId, userId } = await getAuth(ctx);
    return await ctx.db
      .query("calendarSettings")
      .withIndex("by_org_user", (q) => q.eq("organizationId", orgId).eq("userId", userId))
      .unique();
  },
});

export const saveMySettings = mutation({
  args: {
    timezone: v.optional(v.string()),
    durationMin: v.number(),
    bufferMin: v.optional(v.number()),
    meetingLinkType: v.union(v.literal("google_meet"), v.literal("manual")),
    manualUrl: v.optional(v.string()),
    weekly: v.array(v.object({ day: v.number(), start: v.string(), end: v.string() })),
  },
  handler: async (ctx, args): Promise<Id<"calendarSettings">> => {
    const { orgId, userId } = await getAuth(ctx);

    const existing = await ctx.db
      .query("calendarSettings")
      .withIndex("by_org_user", (q) => q.eq("organizationId", orgId).eq("userId", userId))
      .unique();

    const doc = {
      organizationId: orgId,
      userId,
      timezone: args.timezone,
      durationMin: args.durationMin,
      bufferMin: args.bufferMin,
      meetingLinkType: args.meetingLinkType,
      manualUrl: args.manualUrl,
      weekly: args.weekly,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }
    return await ctx.db.insert("calendarSettings", doc);
  },
});

/* =======================================================================
 * Google API helpers (AUTH)
 * ===================================================================== */
export const freeBusy = action({
  args: {
    userId: v.string(),
    timeMinIso: v.string(),
    timeMaxIso: v.string(),
  },
  handler: async (ctx, { userId, timeMinIso, timeMaxIso }): Promise<Array<{ start: number; end: number }>> => {
    const { accessToken } = await ctx.runAction(api.private.calendar.getAccessToken, { userId });

    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: timeMinIso, timeMax: timeMaxIso, items: [{ id: "primary" }] }),
    });

    const json = (await res.json()) as any;
    if (!res.ok) throw new ConvexError(json?.error?.message || "FREEBUSY_FAILED");

    const busy = json?.calendars?.primary?.busy ?? [];
    return busy.map((b: { start: string; end: string }) => ({
      start: Date.parse(b.start),
      end: Date.parse(b.end),
    }));
  },
});

export const createEvent = action({
  args: {
    userId: v.string(),
    summary: v.string(),
    description: v.optional(v.string()),
    startIso: v.string(),
    endIso: v.string(),
    attendees: v.optional(
      v.array(v.object({ email: v.string(), displayName: v.optional(v.string()) }))
    ),
  },
  handler: async (ctx, args): Promise<any> => {
    const { accessToken } = await ctx.runAction(api.private.calendar.getAccessToken, { userId: args.userId });

    const event = {
      summary: args.summary,
      description: args.description,
      start: { dateTime: args.startIso },
      end: { dateTime: args.endIso },
      attendees: args.attendees ?? [],
      reminders: { useDefault: true },
      // Génère automatiquement un lien Google Meet
      conferenceData: { createRequest: { requestId: crypto.randomUUID() } },
    };

    // Envoie d’emails aux invités + Meet activé
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      }
    );
    const json = (await res.json()) as any;
    if (!res.ok) throw new ConvexError(json?.error?.message || "CREATE_EVENT_FAILED");
    return json;
  },
});

/* =======================================================================
 * NO-AUTH variants (pour le widget public)
 * ===================================================================== */

/** Query sans auth: retrouver un compte par org+user */
export const accountByOrgUserNoAuth = query({
  args: { organizationId: v.string(), userId: v.string() },
  handler: async (ctx, { organizationId, userId }): Promise<Doc<"calendarAccounts"> | null> => {
    return await ctx.db
      .query("calendarAccounts")
      .withIndex("by_org_user", (q) => q.eq("organizationId", organizationId).eq("userId", userId))
      .unique();
  },
});

/** Helper interne: échange refresh_token -> access_token (sans auth Convex) */
async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    throw new ConvexError("GOOGLE_OAUTH_NOT_CONFIGURED");
  }

  const body = new URLSearchParams({
    client_id,
    client_secret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json: any = await r.json();

  // 🔥 IMPORTANT: Google renvoie souvent { error: "invalid_grant" }
  if (!r.ok || !json.access_token) {
    const err = String(json?.error || "").toLowerCase();
    const desc = String(json?.error_description || "");
    if (err === "invalid_grant") {
      // standardise le message pour que tout le code catch facilement
      throw new ConvexError("invalid_grant");
    }
    throw new ConvexError(desc || json.error || "TOKEN_EXCHANGE_FAILED");
  }

  return String(json.access_token);
}


/** NO-AUTH: freeBusy par organizationId + userId (utilisé par public/calendar.listSlots) */
export const freeBusyForOrgUser = action({
  args: {
    organizationId: v.string(),
    userId: v.string(),
    timeMinIso: v.string(),
    timeMaxIso: v.string(),
  },
  handler: async (
    ctx,
    { organizationId, userId, timeMinIso, timeMaxIso }
  ): Promise<Array<{ start: number; end: number }>> => {
    const acct = await ctx.runQuery(api.private.calendar.accountByOrgUserNoAuth, {
      organizationId,
      userId,
    });
    if (!acct) throw new ConvexError("NO_CONNECTION");

    let accessToken: string;
    try {
      accessToken = await accessTokenFromRefresh(acct.refreshToken);
    } catch (e) {
      // ✅ KEY: si token cassé => rep non bookable => pas de crash
      const msg = String((e as any)?.message ?? e ?? "").toLowerCase();
      if (msg.includes("invalid_grant")) {
        console.log(
          `[calendar.freeBusyForOrgUser] invalid_grant for org=${organizationId} user=${userId} -> returning []`
        );
        return [];
      }
      throw e;
    }

    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: timeMinIso, timeMax: timeMaxIso, items: [{ id: "primary" }] }),
    });

    const json: any = await res.json();
    if (!res.ok) throw new ConvexError(json?.error?.message || "FREEBUSY_FAILED");

    const busy = json?.calendars?.primary?.busy ?? [];
    return busy.map((b: { start: string; end: string }) => ({
      start: Date.parse(b.start),
      end: Date.parse(b.end),
    }));
  },
});


/** NO-AUTH: createEvent par organizationId + userId (utilisé par public/calendar.bookSlot) */
export const createEventForOrgUser = action({
  args: {
    organizationId: v.string(),
    userId: v.string(),
    summary: v.string(),
    description: v.optional(v.string()),
    startIso: v.string(),
    endIso: v.string(),
    attendees: v.optional(
      v.array(v.object({ email: v.string(), displayName: v.optional(v.string()) }))
    ),
  },
  handler: async (ctx, args): Promise<any> => {
    const acct = await ctx.runQuery(api.private.calendar.accountByOrgUserNoAuth, {
      organizationId: args.organizationId,
      userId: args.userId,
    });
    if (!acct) throw new ConvexError("NO_CONNECTION");

    let accessToken: string;
    try {
      accessToken = await accessTokenFromRefresh(acct.refreshToken);
    } catch (e) {
      const msg = String((e as any)?.message ?? e ?? "").toLowerCase();
      if (msg.includes("invalid_grant")) {
        // ✅ ici on bloque : sinon tu “book” sur un rep sans calendrier valide
        throw new ConvexError("CALENDAR_RECONNECT_REQUIRED");
      }
      throw e;
    }

    const event = {
      summary: args.summary,
      description: args.description,
      start: { dateTime: args.startIso },
      end: { dateTime: args.endIso },
      attendees: args.attendees ?? [],
      reminders: { useDefault: true },
      conferenceData: { createRequest: { requestId: crypto.randomUUID() } },
    };

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      }
    );

    const json: any = await res.json();
    if (!res.ok) throw new ConvexError(json?.error?.message || "CREATE_EVENT_FAILED");
    return json;
  },
});

