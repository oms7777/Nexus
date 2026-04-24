// packages/backend/convex/public/calendar.ts
import { query, action } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

type Slot = { start: number; end: number };

function linkAppOrigin(): string {
  const o = process.env.APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (o && /^https?:\/\//i.test(o)) return o.replace(/\/$/, "");
  return "https://app.inboundless.co";
}

// ✅ Align with routing.public types (no role here)
type PublicRep = {
  userId: string;
  available: boolean;
  regions: string[];
  name?: string;
  avatarUrl?: string;
  title?: string;
};

type PickBestRepAndListSlotsResult = {
  rep: PublicRep | null;
  slots: Slot[];
};

function toErrString(e: unknown) {
  if (!e) return "";
  if (typeof e === "string") return e;
  const anyE = e as any;
  return anyE?.message ?? anyE?.toString?.() ?? "";
}

function isInvalidGrant(e: unknown) {
  const s = toErrString(e).toLowerCase();
  return s.includes("invalid_grant") || s.includes("calendar_reconnect_required");
}

const BOOKING_COMPANY_BLOCK = new Set([
  "test",
  "none",
  "n/a",
  "na",
  "null",
  "unknown",
  "asdf",
  "qwerty",
  "qqq",
  "xxx",
  "hhh",
  "daf",
  "ads",
  "sqd",
  "dkf",
  "sd",
  "lol",
  "foo",
  "bar",
  "abc",
  "xyz",
]);

function isPlausibleBookingCompanyName(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (s.length === 0) return true;
  if (s.length < 3 || s.length > 120) return false;
  if (/^(.)\1{2,}$/.test(s)) return false;
  if (BOOKING_COMPANY_BLOCK.has(s)) return false;
  return true;
}

function meetingUrlFromCreatedCalendarEvent(event: any): string | undefined {
  // Google Calendar API
  const hangout = typeof event?.hangoutLink === "string" ? event.hangoutLink : "";
  if (hangout) return hangout;

  // Microsoft Graph (Teams online meeting)
  const teamsJoin =
    typeof event?.onlineMeeting?.joinUrl === "string"
      ? event.onlineMeeting.joinUrl
      : typeof event?.onlineMeeting?.joinWebUrl === "string"
        ? event.onlineMeeting.joinWebUrl
        : "";
  if (teamsJoin) return teamsJoin;

  // Fallbacks
  const web = typeof event?.webLink === "string" ? event.webLink : "";
  if (web) return web;

  const html = typeof event?.htmlLink === "string" ? event.htmlLink : "";
  if (html) return html;

  return undefined;
}

/* -------------------------------------------------------------
 * Compte calendrier connecté pour une org + user (multi-reps)
 * ----------------------------------------------------------- */
export const getAccount = query({
  args: {
    organizationId: v.string(),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, userId }) => {
    let acct: { userId: string; email?: string; provider: "google" | "microsoft" } | null = null;

    if (userId) {
      const byUser = await ctx.db
        .query("calendarAccounts")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", organizationId).eq("userId", userId),
        )
        .unique();

      if (byUser) {
        acct = byUser;
      } else {
        // ✅ If user specified => never fallback to org-level
        return null;
      }
    } else {
      const byOrg = await ctx.db
        .query("calendarAccounts")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .first();

      if (byOrg) acct = byOrg;
    }

    if (!acct) return null;
    return { userId: acct.userId, email: acct.email ?? "", provider: acct.provider };
  },
});

/* -------------------------------------------------------------
 * Settings (B-version) pour un user (rep) dans une org
 * ----------------------------------------------------------- */
export const getSettingsForOrg = query({
  args: {
    organizationId: v.string(),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, userId }) => {
    let effectiveUserId = userId;

    if (!effectiveUserId) {
      const acct = await ctx.db
        .query("calendarAccounts")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .first();
      if (!acct) return null;
      effectiveUserId = acct.userId;
    }

    const settings = await ctx.db
      .query("calendarSettings")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", effectiveUserId!),
      )
      .unique();

    return settings;
  },
});

/* -------------------------------------------------------------
 * Liste des créneaux (safe invalid_grant)
 * ----------------------------------------------------------- */
export const listSlots = action({
  args: {
    organizationId: v.string(),
    userId: v.optional(v.string()),
    days: v.number(),
    slotMinutes: v.optional(v.number()),
    contactSessionId: v.optional(v.id("contactSessions")),
  },
  handler: async (ctx, { organizationId, userId, days, slotMinutes }) => {
    const acct = await ctx.runQuery(api.public.calendar.getAccount, {
      organizationId,
      userId,
    });
    if (!acct) return [] as Array<{ start: number; end: number }>;

    const settings = await ctx.runQuery(api.public.calendar.getSettingsForOrg, {
      organizationId,
      userId: acct.userId,
    });

    type Win = { day: number; start: string; end: string };
    const weekly: Win[] =
      settings?.weekly ?? [
        { day: 1, start: "09:00", end: "17:00" },
        { day: 2, start: "09:00", end: "17:00" },
        { day: 3, start: "09:00", end: "17:00" },
        { day: 4, start: "09:00", end: "17:00" },
        { day: 5, start: "09:00", end: "17:00" },
      ];

    const durationMin = settings?.durationMin ?? slotMinutes ?? 30;
    const bufferMin = settings?.bufferMin ?? 0;

    const durationMs = durationMin * 60 * 1000;
    const stepMs = durationMs;
    const bufferMs = bufferMin * 60 * 1000;

    const now = Date.now();
    const rangeEnd = now + days * 24 * 60 * 60 * 1000;

    let busy: Array<{ start: number; end: number }> = [];
    try {
      busy = await ctx.runAction(api.private.calendar.freeBusyForOrgUser, {
        organizationId,
        userId: acct.userId,
        timeMinIso: new Date(now).toISOString(),
        timeMaxIso: new Date(rangeEnd).toISOString(),
      });
    } catch (e) {
      if (isInvalidGrant(e)) {
        console.log(
          `[calendar.listSlots] token invalid for userId=${acct.userId} org=${organizationId} -> returning empty slots`,
        );
        return [];
      }
      console.log(
        `[calendar.listSlots] freeBusy failed for userId=${acct.userId} org=${organizationId}:`,
        e,
      );
      return [];
    }

    const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
      aStart < bEnd && aEnd > bStart;

    const slots: Array<{ start: number; end: number }> = [];

    const jsToOurDow = (jsDay: number) => (jsDay === 0 ? 7 : jsDay);

    const getWindowForDate = (d: Date) => {
      const ourDow = jsToOurDow(d.getDay());
      const rec = weekly.find((w) => w.day === ourDow);
      if (!rec) return null;

      const mkTs = (hhmm: string) => {
        const [hStr = "0", mStr = "0"] = (hhmm ?? "").split(":");
        const h = Number(hStr);
        const m = Number(mStr);
        if (!Number.isFinite(h) || !Number.isFinite(m)) {
          throw new Error(`Invalid time string: "${hhmm}"`);
        }
        const nd = new Date(d);
        nd.setHours(h, m, 0, 0);
        return nd.getTime();
      };

      return { startMs: mkTs(rec.start), endMs: mkTs(rec.end) };
    };

    for (let i = 0; i < days; i++) {
      const day = new Date(now + i * 24 * 60 * 60 * 1000);
      const win = getWindowForDate(day);
      if (!win) continue;

      for (let t = win.startMs; t + durationMs <= win.endMs; t += stepMs) {
        const start = Math.max(t, now);
        const end = start + durationMs;

        const paddedStart = start - bufferMs;
        const paddedEnd = end + bufferMs;

        const isBusy = busy.some((b) => overlaps(paddedStart, paddedEnd, b.start, b.end));
        if (!isBusy) slots.push({ start, end });
      }
    }

    try {
      await ctx.runMutation(api.public.analytics.log, {
        organizationId,
        type: "calendar_slots_loaded",
        meta: {
          count: Math.min(slots.length, 200),
          days,
          slotMinutes: durationMin,
          userId: acct.userId,
        },
      });
    } catch (e) {
      console.log("analytics.log(calendar_slots_loaded) failed:", e);
    }

    return slots;
  },
});

/* -------------------------------------------------------------
 * Auto-assign: choisir meilleur rep + slots
 * ✅ Fige le rep sur la session dès qu’on trouve des slots.
 * ----------------------------------------------------------- */
export const pickBestRepAndListSlots = action({
  args: {
    organizationId: v.string(),
    contactSessionId: v.optional(v.id("contactSessions")),
    days: v.number(),
    slotMinutes: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { organizationId, contactSessionId, days, slotMinutes },
  ): Promise<PickBestRepAndListSlotsResult> => {
    if (!contactSessionId) return { rep: null, slots: [] };

    const reps = (await ctx.runQuery(api.public.routing.listCandidatesForAutoAssign, {
      organizationId,
      contactSessionId,
    })) as PublicRep[];

    if (!reps?.length) return { rep: null, slots: [] };

    for (const rep of reps) {
      if (rep.available === false) continue;

      const acct = await ctx.runQuery(api.public.calendar.getAccount, {
        organizationId,
        userId: rep.userId,
      });
      if (!acct) continue;

      try {
        const slots = (await ctx.runAction(api.public.calendar.listSlots, {
          organizationId,
          userId: rep.userId,
          days,
          slotMinutes,
          contactSessionId,
        })) as Slot[];

        if (slots?.length) {
          // ✅ persist stable assignment immediately
          await ctx.runMutation(api.routing.ensureAssignmentForSession, {
            organizationId,
            contactSessionId,
            forceUserId: rep.userId,
          });

          return { rep, slots };
        }
      } catch (e) {
        if (isInvalidGrant(e)) {
          console.log(
            `[calendar.pickBestRepAndListSlots] invalid token for rep=${rep.userId} -> skipping`,
          );
          continue;
        }
        console.log(
          `[calendar.pickBestRepAndListSlots] slots failed for rep=${rep.userId} -> skipping`,
          e,
        );
        continue;
      }
    }

    return { rep: null, slots: [] };
  },
});

/* -------------------------------------------------------------
 * Book: Google event + booking + Slack + email + Salesforce
 * ----------------------------------------------------------- */
export const bookSlot = action({
  args: {
    organizationId: v.string(),
    userId: v.optional(v.string()),
    contactSessionId: v.id("contactSessions"),
    attendeeName: v.string(),
    attendeeEmail: v.string(),
    attendeePhone: v.optional(v.string()),
    start: v.number(),
    end: v.number(),
    attendeeCompany: v.optional(v.string()),
    attendeeRole: v.optional(v.string()),
    attendeeDescription: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      organizationId,
      userId,
      contactSessionId,
      attendeeName,
      attendeeEmail,
      attendeePhone,
      start,
      end,
      attendeeCompany,
      attendeeRole,
      attendeeDescription,
    },
  ): Promise<{ bookingId: Id<"calendarBookings">; meetingUrl?: string }> => {
    const coCheck = (attendeeCompany ?? "").trim();
    if (coCheck && !isPlausibleBookingCompanyName(coCheck)) {
      throw new ConvexError({
        code: "INVALID_COMPANY",
        message:
          "Please enter a real company name (at least 3 characters), or leave the field empty — test words like “abc” are not accepted.",
      });
    }

    // 0) routing (if user not forced)
    let effectiveUserId = userId;

    if (!effectiveUserId) {
      const assignment = await ctx.runMutation(api.routing.ensureAssignmentForSession, {
        organizationId,
        contactSessionId,
      });
      if (assignment.assignedRepUserId) effectiveUserId = assignment.assignedRepUserId;
    }

    // 1) choose connected calendar account
    const acct = await ctx.runQuery(api.public.calendar.getAccount, {
      organizationId,
      userId: effectiveUserId,
    });
    if (!acct) throw new Error("No connected calendar for this organization / user");

    const useCase = (attendeeDescription ?? "").trim();

    const descriptionLines = [
      useCase ? `Use case: ${useCase}` : null,
      "",
      `Name: ${attendeeName}`,
      `Email: ${attendeeEmail}`,
      attendeePhone ? `Phone: ${attendeePhone}` : null,
      attendeeCompany ? `Company: ${attendeeCompany}` : null,
      attendeeRole ? `Role: ${attendeeRole}` : null,
    ].filter(Boolean);

    // 2) create calendar event (Google Meet or Microsoft Teams, depending on provider)
    const event: any = await ctx.runAction(api.private.calendar.createEventForOrgUser, {
      organizationId,
      userId: acct.userId,
      summary: `Demo with ${attendeeName}`,
      description: descriptionLines.join("\n"),
      startIso: new Date(start).toISOString(),
      endIso: new Date(end).toISOString(),
      attendees: [
        { email: attendeeEmail, displayName: attendeeName },
        ...(acct.email ? [{ email: acct.email }] : []),
      ],
    });

    const meetingUrl: string | undefined = meetingUrlFromCreatedCalendarEvent(event);

    // 3) save booking in DB
    const bookingId = await ctx.runMutation(api.public.booking.create, {
      organizationId,
      contactSessionId,
      attendeeName,
      attendeeEmail,
      start,
      end,
      createdByUserId: acct.userId,
      meetingUrl,
      externalEventId: event?.id as string | undefined,
      providerData: {
        calendarId: "primary",
        company: attendeeCompany,
        role: attendeeRole,
        phone: attendeePhone,
        description: useCase || undefined,
      },
    });

    // Lead summary + journey (widget conversation) — non bloquant
    let bookingLeadSlackAppend = "";
    let bookingLeadEmailHtml: string | undefined;
    let bookingConversationUrl: string | undefined;
    let bookingAiSummaryMarkdown: string | undefined;
    try {
      const convId = await ctx.runQuery(internal.private.leadDigest.getLatestConversationIdForSession, {
        organizationId,
        contactSessionId,
      });
      if (convId) {
        bookingConversationUrl = `${linkAppOrigin()}/conversations/${convId}`;
        const extras = await ctx.runAction(internal.private.leadNotify.buildBookingLeadExtras, {
          conversationId: convId,
          bookingForm: {
            attendeeName,
            attendeeEmail,
            attendeeCompany,
            attendeeRole,
            attendeePhone,
            useCase: useCase || undefined,
          },
        });
        if (extras.ok) {
          bookingLeadSlackAppend = `\n\n${extras.slackAppend}`;
          bookingLeadEmailHtml = extras.emailHtmlFragment;
          bookingAiSummaryMarkdown = extras.aiLeadSummaryMarkdown;
        }
      }
    } catch (e) {
      console.log("[calendar.bookSlot] lead context for notifications skipped:", e);
    }

    // Salesforce — non bloquant (after lead extras: AI summary → Note; visitor text + conv link → Lead.Description)
    try {
      await ctx.runAction(api.integrations.createSalesforceLeadAndEvent, {
        organizationId,
        attendeeName,
        attendeeEmail,
        attendeePhone,
        attendeeCompany,
        attendeeRole,
        attendeeDescription: useCase || undefined,
        conversationUrl: bookingConversationUrl,
        aiLeadSummaryMarkdown: bookingAiSummaryMarkdown,
        startIso: new Date(start).toISOString(),
        endIso: new Date(end).toISOString(),
        meetingUrl,
        source: "Inboundless",
      });
    } catch (e) {
      console.log("Salesforce create Lead/Event failed:", e);
    }

    // HubSpot — non bloquant
    try {
      await ctx.runAction(api.hubspot.createHubSpotContactFromBooking, {
        organizationId,
        attendeeName,
        attendeeEmail,
        attendeePhone,
        attendeeCompany,
        attendeeRole,
        attendeeDescription: useCase || undefined,
        conversationUrl: bookingConversationUrl,
        startIso: new Date(start).toISOString(),
        endIso: new Date(end).toISOString(),
        meetingUrl,
        source: "Inboundless",
      });
    } catch (e) {
      console.log("HubSpot contact upsert failed:", e);
    }

    // Slack — non bloquant
    try {
      const startDate = new Date(start);
      const dateLabel = startDate.toLocaleString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const lines = [
        "📅 *New meeting booked!*",
        `• Client: *${attendeeName}* (${attendeeEmail})`,
        attendeePhone ? `• Phone: ${attendeePhone}` : null,
        attendeeCompany ? `• Company: ${attendeeCompany}` : null,
        attendeeRole ? `• Role: ${attendeeRole}` : null,
        useCase ? `• Use case: ${useCase}` : null,
        `• When: *${dateLabel}*`,
        meetingUrl ? `• Link: ${meetingUrl}` : null,
      ].filter(Boolean);

      const rep = await ctx.runQuery(api.team.getRepForVisitor, {
        organizationId,
        contactSessionId,
        userId: acct.userId,
      });

      await ctx.runAction(api.integrations.sendSlackMessage, {
        organizationId,
        text: `${lines.join("\n")}${bookingLeadSlackAppend}`,
        dmChannelId: rep?.slackDmChannel ?? undefined,
        slackUserId: rep?.slackUserId ?? undefined,
      });
    } catch (e) {
      console.log("Slack sendSlackMessage failed:", e);
    }

    // email sales — non bloquant
    const salesEmail = acct.email;
    if (salesEmail) {
      try {
        await ctx.runAction(api.private.notifications.sendBookingEmailToSales, {
          to: salesEmail,
          attendeeName,
          attendeeEmail,
          attendeeCompany,
          attendeeRole,
          startIso: new Date(start).toISOString(),
          endIso: new Date(end).toISOString(),
          meetingUrl,
          bookingId: String(bookingId),
          attendeePhone,
          attendeeDescription: useCase || undefined,
          leadContextHtml: bookingLeadEmailHtml,
          conversationUrl: bookingConversationUrl,
        });
      } catch (e) {
        console.log("sendBookingEmailToSales skipped/failed:", e);
      }
    }

    // Persist company on session so later events enrich with Signals identity (non bloquant)
    try {
      const co = (attendeeCompany ?? "").trim();
      if (co) {
        await ctx.runMutation(api.public.contactSessions.applyBookingCompany, {
          sessionId: contactSessionId,
          company: co,
        });
      }
    } catch (e) {
      console.log("[calendar.bookSlot] session company patch skipped:", e);
    }

    // analytics — non bloquant
    try {
      await ctx.runMutation(api.public.analytics.log, {
        organizationId,
        type: "meeting_booked",
        userId: acct.userId,
        sessionId: contactSessionId,
        meta: {
          bookingId,
          attendeeName,
          attendeeEmail,
          attendeePhone,
          attendeeCompany,
          attendeeRole,
          attendeeDescription: useCase || undefined,
          start,
          end,
          meetingUrl,
          organizerEmail: acct.email ?? null,
          organizerUserId: acct.userId,
        },
      });
    } catch (e) {
      console.log("analytics.log(meeting_booked) failed:", e);
    }

    return { bookingId, meetingUrl };
  },
});

export const getAuthUrl = action({
  args: { redirectUrl: v.string() },
  handler: async (_ctx, { redirectUrl }) => `${redirectUrl}?connect=google`,
});

export const exchangeCode = action({
  args: {
    organizationId: v.string(),
    userId: v.string(),
    code: v.string(),
    redirectUrl: v.string(),
  },
  handler: async () => ({ ok: true }),
});