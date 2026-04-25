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
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", orgId).eq("userId", userId)
      )
      .unique();
  },
});

export const accountForUser = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }): Promise<Doc<"calendarAccounts"> | null> => {
    const { orgId } = await getAuth(ctx);
    return await ctx.db
      .query("calendarAccounts")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", orgId).eq("userId", userId)
      )
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
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", orgId).eq("userId", userId)
      )
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

export const saveMicrosoftAccount = mutation({
  args: {
    email: v.string(),
    refreshToken: v.string(),
    scope: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"calendarAccounts">> => {
    const { orgId, userId } = await getAuth(ctx);
    const existing = await ctx.db
      .query("calendarAccounts")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", orgId).eq("userId", userId)
      )
      .unique();

    const doc = {
      organizationId: orgId,
      userId,
      provider: "microsoft" as const,
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
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", orgId).eq("userId", userId)
      )
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

    if (acct.provider === "google") {
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
      return {
        accessToken: String(json.access_token),
        expiresIn: Number(json.expires_in ?? 3600),
      };
    }

    if (acct.provider === "microsoft") {
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new ConvexError("MICROSOFT_OAUTH_NOT_CONFIGURED");

      const scope =
        acct.scope ||
        ["offline_access", "openid", "profile", "email", "User.Read", "Calendars.ReadWrite"].join(
          " "
        );

      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: acct.refreshToken,
        scope,
      });

      const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const json = (await res.json()) as any;
      if (!res.ok || !json.access_token) {
        throw new ConvexError(json.error || json.error_description || "TOKEN_EXCHANGE_FAILED");
      }
      return {
        accessToken: String(json.access_token),
        expiresIn: Number(json.expires_in ?? 3600),
      };
    }

    throw new ConvexError("UNSUPPORTED_PROVIDER");
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
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", orgId).eq("userId", userId)
      )
      .unique();
  },
});

export const saveMySettings = mutation({
  args: {
    timezone: v.optional(v.string()),
    durationMin: v.number(),
    bufferMin: v.optional(v.number()),
    meetingLinkType: v.union(v.literal("google_meet"), v.literal("teams"), v.literal("manual")),
    manualUrl: v.optional(v.string()),
    weekly: v.array(v.object({ day: v.number(), start: v.string(), end: v.string() })),
  },
  handler: async (ctx, args): Promise<Id<"calendarSettings">> => {
    const { orgId, userId } = await getAuth(ctx);

    const existing = await ctx.db
      .query("calendarSettings")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", orgId).eq("userId", userId)
      )
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
 * Calendar API helpers (AUTH)
 * ===================================================================== */
export const freeBusy = action({
  args: {
    userId: v.string(),
    timeMinIso: v.string(),
    timeMaxIso: v.string(),
  },
  handler: async (
    ctx,
    { userId, timeMinIso, timeMaxIso }
  ): Promise<Array<{ start: number; end: number }>> => {
    const acct = await ctx.runQuery(api.private.calendar.accountForUser, { userId });
    if (!acct) throw new ConvexError("NO_CONNECTION");

    const { accessToken } = await ctx.runAction(api.private.calendar.getAccessToken, { userId });

    if (acct.provider === "google") {
      const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin: timeMinIso,
          timeMax: timeMaxIso,
          items: [{ id: "primary" }],
        }),
      });

      const json = (await res.json()) as any;
      if (!res.ok) throw new ConvexError(json?.error?.message || "FREEBUSY_FAILED");

      const busy = json?.calendars?.primary?.busy ?? [];
      return busy.map((b: { start: string; end: string }) => ({
        start: Date.parse(b.start),
        end: Date.parse(b.end),
      }));
    }

    if (acct.provider === "microsoft") {
      const res = await fetch("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schedules: ["me"],
          startTime: { dateTime: timeMinIso, timeZone: "UTC" },
          endTime: { dateTime: timeMaxIso, timeZone: "UTC" },
          availabilityViewInterval: 30,
        }),
      });

      const json = (await res.json()) as any;
      if (!res.ok) throw new ConvexError(json?.error?.message || "FREEBUSY_FAILED");

      const items = json?.value?.[0]?.scheduleItems ?? [];
      return items.map((it: any) => ({
        start: Date.parse(it?.start?.dateTime),
        end: Date.parse(it?.end?.dateTime),
      }));
    }

    throw new ConvexError("UNSUPPORTED_PROVIDER");
  },
});

export const createEvent = action({
  args: {
    userId: v.string(),
    summary: v.string(),
    description: v.optional(v.string()),
    startIso: v.string(),
    endIso: v.string(),
    attendees: v.optional(v.array(v.object({ email: v.string(), displayName: v.optional(v.string()) }))),
    meetingLinkType: v.optional(
      v.union(v.literal("google_meet"), v.literal("teams"), v.literal("manual"))
    ),
    manualUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const acct = await ctx.runQuery(api.private.calendar.accountForUser, { userId: args.userId });
    if (!acct) throw new ConvexError("NO_CONNECTION");

    const { accessToken } = await ctx.runAction(api.private.calendar.getAccessToken, {
      userId: args.userId,
    });

    const meetingLinkType = args.meetingLinkType ?? "google_meet";
    const manualUrl = (args.manualUrl ?? "").trim();

    if (acct.provider === "google") {
      const wantsMeet = meetingLinkType === "google_meet";
      const wantsManual = meetingLinkType === "manual";
      const wantsTeams = meetingLinkType === "teams";
      if (wantsManual && !manualUrl) {
        throw new ConvexError("MANUAL_MEETING_URL_REQUIRED");
      }

      let joinBlock = "";
      if (wantsManual) joinBlock = `\n\nJoin link: ${manualUrl}`;
      else if (wantsTeams && manualUrl) joinBlock = `\n\nJoin link (Teams): ${manualUrl}`;

      const event: any = {
        summary: args.summary,
        description: `${args.description ?? ""}${joinBlock}`,
        start: { dateTime: args.startIso },
        end: { dateTime: args.endIso },
        attendees: args.attendees ?? [],
        reminders: { useDefault: true },
      };
      if (wantsMeet) {
        event.conferenceData = { createRequest: { requestId: crypto.randomUUID() } };
      }
      if (wantsManual || (wantsTeams && manualUrl)) {
        event.location = manualUrl;
      }

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all${
          wantsMeet ? "&conferenceDataVersion=1" : ""
        }`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        }
      );

      const json = (await res.json()) as any;
      if (!res.ok) throw new ConvexError(json?.error?.message || "CREATE_EVENT_FAILED");
      return json;
    }

    if (acct.provider === "microsoft") {
      const wantsTeams = meetingLinkType === "teams";
      const wantsManual = meetingLinkType === "manual";
      const wantsGoogleMeet = meetingLinkType === "google_meet";
      if (wantsManual && !manualUrl) {
        throw new ConvexError("MANUAL_MEETING_URL_REQUIRED");
      }

      let joinBlock = "";
      if (wantsManual) {
        joinBlock = `<p><b>Join link:</b> <a href="${manualUrl}">${manualUrl}</a></p>`;
      } else if (wantsGoogleMeet && manualUrl) {
        joinBlock = `<p><b>Join (Google Meet):</b> <a href="${manualUrl}">${manualUrl}</a></p>`;
      }
      const event: any = {
        subject: args.summary,
        body: {
          contentType: "HTML",
          content: `${args.description ?? ""}${joinBlock}`,
        },
        start: { dateTime: args.startIso, timeZone: "UTC" },
        end: { dateTime: args.endIso, timeZone: "UTC" },
        attendees: (args.attendees ?? []).map((a) => ({
          emailAddress: { address: a.email, name: a.displayName ?? a.email },
          type: "required",
        })),
        isOnlineMeeting: wantsTeams,
        ...(wantsTeams ? { onlineMeetingProvider: "teamsForBusiness" } : {}),
        ...((wantsManual || (wantsGoogleMeet && manualUrl)) && manualUrl
          ? { location: { displayName: manualUrl } }
          : {}),
      };

      const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });

      const json = (await res.json()) as any;
      if (!res.ok) throw new ConvexError(json?.error?.message || "CREATE_EVENT_FAILED");
      return json;
    }

    throw new ConvexError("UNSUPPORTED_PROVIDER");
  },
});

/* =======================================================================
 * NO-AUTH variants (pour le widget public)
 * ===================================================================== */

/** Query sans auth: retrouver un compte par org+user */
export const accountByOrgUserNoAuth = query({
  args: { organizationId: v.string(), userId: v.string() },
  handler: async (
    ctx,
    { organizationId, userId }
  ): Promise<Doc<"calendarAccounts"> | null> => {
    return await ctx.db
      .query("calendarAccounts")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", userId)
      )
      .unique();
  },
});

/** Helper interne: échange refresh_token -> access_token (sans auth Convex) */
async function accessTokenFromRefreshGoogle(refreshToken: string): Promise<string> {
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

  if (!r.ok || !json.access_token) {
    const err = String(json?.error || "").toLowerCase();
    const desc = String(json?.error_description || "");
    if (err === "invalid_grant") {
      throw new ConvexError("invalid_grant");
    }
    throw new ConvexError(desc || json.error || "TOKEN_EXCHANGE_FAILED");
  }

  return String(json.access_token);
}

async function accessTokenFromRefreshMicrosoft(
  refreshToken: string,
  scope?: string
): Promise<string> {
  const client_id = process.env.MICROSOFT_CLIENT_ID;
  const client_secret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    throw new ConvexError("MICROSOFT_OAUTH_NOT_CONFIGURED");
  }

  const scopes =
    scope ||
    ["offline_access", "openid", "profile", "email", "User.Read", "Calendars.ReadWrite"].join(" ");

  const body = new URLSearchParams({
    client_id,
    client_secret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: scopes,
  });

  const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json: any = await r.json();

  if (!r.ok || !json.access_token) {
    const err = String(json?.error || "").toLowerCase();
    const desc = String(json?.error_description || "");
    if (err === "invalid_grant") {
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
      accessToken =
        acct.provider === "microsoft"
          ? await accessTokenFromRefreshMicrosoft(acct.refreshToken, acct.scope)
          : await accessTokenFromRefreshGoogle(acct.refreshToken);
    } catch (e) {
      const msg = String((e as any)?.message ?? e ?? "").toLowerCase();
      if (msg.includes("invalid_grant")) {
        console.log(
          `[calendar.freeBusyForOrgUser] invalid_grant for org=${organizationId} user=${userId} -> reconnect required`
        );
        throw new ConvexError("CALENDAR_RECONNECT_REQUIRED");
      }
      throw e;
    }

    if (acct.provider === "google") {
      const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin: timeMinIso,
          timeMax: timeMaxIso,
          items: [{ id: "primary" }],
        }),
      });

      const json: any = await res.json();
      if (!res.ok) throw new ConvexError(json?.error?.message || "FREEBUSY_FAILED");

      const busy = json?.calendars?.primary?.busy ?? [];
      return busy.map((b: { start: string; end: string }) => ({
        start: Date.parse(b.start),
        end: Date.parse(b.end),
      }));
    }

    if (acct.provider === "microsoft") {
      const res = await fetch("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          schedules: ["me"],
          startTime: { dateTime: timeMinIso, timeZone: "UTC" },
          endTime: { dateTime: timeMaxIso, timeZone: "UTC" },
          availabilityViewInterval: 30,
        }),
      });

      const json: any = await res.json();
      if (!res.ok) throw new ConvexError(json?.error?.message || "FREEBUSY_FAILED");

      const items = json?.value?.[0]?.scheduleItems ?? [];
      return items.map((it: any) => ({
        start: Date.parse(it?.start?.dateTime),
        end: Date.parse(it?.end?.dateTime),
      }));
    }

    throw new ConvexError("UNSUPPORTED_PROVIDER");
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
    attendees: v.optional(v.array(v.object({ email: v.string(), displayName: v.optional(v.string()) }))),
    meetingLinkType: v.optional(
      v.union(v.literal("google_meet"), v.literal("teams"), v.literal("manual"))
    ),
    manualUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const acct = await ctx.runQuery(api.private.calendar.accountByOrgUserNoAuth, {
      organizationId: args.organizationId,
      userId: args.userId,
    });
    if (!acct) throw new ConvexError("NO_CONNECTION");

    let accessToken: string;
    try {
      accessToken =
        acct.provider === "microsoft"
          ? await accessTokenFromRefreshMicrosoft(acct.refreshToken, acct.scope)
          : await accessTokenFromRefreshGoogle(acct.refreshToken);
    } catch (e) {
      const msg = String((e as any)?.message ?? e ?? "").toLowerCase();
      if (msg.includes("invalid_grant")) {
        console.log(
          `[calendar.createEventForOrgUser] invalid_grant for org=${args.organizationId} user=${args.userId} -> reconnect required`
        );
        throw new ConvexError("CALENDAR_RECONNECT_REQUIRED");
      }
      throw e;
    }

    const meetingLinkType = args.meetingLinkType ?? "google_meet";
    const manualUrl = (args.manualUrl ?? "").trim();

    if (acct.provider === "google") {
      const wantsMeet = meetingLinkType === "google_meet";
      const wantsManual = meetingLinkType === "manual";
      const wantsTeams = meetingLinkType === "teams";
      if (wantsManual && !manualUrl) {
        throw new ConvexError("MANUAL_MEETING_URL_REQUIRED");
      }

      let joinBlock = "";
      if (wantsManual) joinBlock = `\n\nJoin link: ${manualUrl}`;
      else if (wantsTeams && manualUrl) joinBlock = `\n\nJoin link (Teams): ${manualUrl}`;

      const event: any = {
        summary: args.summary,
        description: `${args.description ?? ""}${joinBlock}`,
        start: { dateTime: args.startIso },
        end: { dateTime: args.endIso },
        attendees: args.attendees ?? [],
        reminders: { useDefault: true },
      };
      if (wantsMeet) {
        event.conferenceData = { createRequest: { requestId: crypto.randomUUID() } };
      }
      if (wantsManual || (wantsTeams && manualUrl)) {
        event.location = manualUrl;
      }

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all${
          wantsMeet ? "&conferenceDataVersion=1" : ""
        }`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(event),
        }
      );

      const json: any = await res.json();
      if (!res.ok) throw new ConvexError(json?.error?.message || "CREATE_EVENT_FAILED");
      return json;
    }

    if (acct.provider === "microsoft") {
      const wantsTeams = meetingLinkType === "teams";
      const wantsManual = meetingLinkType === "manual";
      const wantsGoogleMeet = meetingLinkType === "google_meet";
      if (wantsManual && !manualUrl) {
        throw new ConvexError("MANUAL_MEETING_URL_REQUIRED");
      }

      let joinBlock = "";
      if (wantsManual) {
        joinBlock = `<p><b>Join link:</b> <a href="${manualUrl}">${manualUrl}</a></p>`;
      } else if (wantsGoogleMeet && manualUrl) {
        joinBlock = `<p><b>Join (Google Meet):</b> <a href="${manualUrl}">${manualUrl}</a></p>`;
      }
      const event: any = {
        subject: args.summary,
        body: { contentType: "HTML", content: `${args.description ?? ""}${joinBlock}` },
        start: { dateTime: args.startIso, timeZone: "UTC" },
        end: { dateTime: args.endIso, timeZone: "UTC" },
        attendees: (args.attendees ?? []).map((a) => ({
          emailAddress: { address: a.email, name: a.displayName ?? a.email },
          type: "required",
        })),
        isOnlineMeeting: wantsTeams,
        ...(wantsTeams ? { onlineMeetingProvider: "teamsForBusiness" } : {}),
        ...((wantsManual || (wantsGoogleMeet && manualUrl)) && manualUrl
          ? { location: { displayName: manualUrl } }
          : {}),
      };

      const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });

      const json: any = await res.json();
      if (!res.ok) throw new ConvexError(json?.error?.message || "CREATE_EVENT_FAILED");
      return json;
    }

    throw new ConvexError("UNSUPPORTED_PROVIDER");
  },
});
