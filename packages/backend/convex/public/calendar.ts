// packages/backend/convex/public/calendar.ts
import { query, action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

type Slot = { start: number; end: number };

// Le shape minimal dont on a besoin ici (vient de routing.listRepsForVisitor)
type PublicRep = {
  userId: string;
  role: "sales" | "support";
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


/* -------------------------------------------------------------
 * Compte Google connecté pour une org + user (multi-reps)
 * ----------------------------------------------------------- */
export const getAccount = query({
  args: {
    organizationId: v.string(),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, userId }) => {
    let acct: { userId: string; email?: string } | null = null;

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
        // ✅ IMPORTANT: if userId is specified, do NOT fallback to org-level
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
    return { userId: acct.userId, email: acct.email ?? "" };
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
 * Liste des créneaux
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

    const busy = await ctx.runAction(api.private.calendar.freeBusyForOrgUser, {
      organizationId,
      userId: acct.userId,
      timeMinIso: new Date(now).toISOString(),
      timeMaxIso: new Date(rangeEnd).toISOString(),
    });

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
export const pickBestRepAndListSlots = action({
  args: {
    organizationId: v.string(),
    contactSessionId: v.optional(v.id("contactSessions")),
    days: v.number(),
    slotMinutes: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { organizationId, contactSessionId, days, slotMinutes }
  ): Promise<PickBestRepAndListSlotsResult> => {
    if (!contactSessionId) return { rep: null, slots: [] };

    // 1) candidats (déjà filtrés territoire / routage côté routing.listRepsForVisitor)
    const reps = (await ctx.runQuery(api.public.routing.listCandidatesForAutoAssign, {
      organizationId,
      contactSessionId,
    })) as PublicRep[];

    if (!reps?.length) return { rep: null, slots: [] };

    // 2) essaye reps dans l’ordre (propre + fallback)
    for (const rep of reps) {
      if (rep.role !== "sales") continue;
      if (rep.available === false) continue;

      // must have a calendar connected for THIS user
      const acct = await ctx.runQuery(api.public.calendar.getAccount, {
        organizationId,
        userId: rep.userId,
      });
      if (!acct) continue;

      // slots for this rep
      const slots = (await ctx.runAction(api.public.calendar.listSlots, {
        organizationId,
        userId: rep.userId,
        days,
        slotMinutes,
        contactSessionId,
      })) as Slot[];

      if (slots?.length) {
        return { rep, slots };
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
    // 0) routing (if user not forced)
    let effectiveUserId = userId;

    if (!effectiveUserId) {
      try {
        const routedUserId = await ctx.runQuery(api.routing.pickRepForSession, {
          organizationId,
          contactSessionId,
        });
        if (routedUserId) effectiveUserId = routedUserId;
      } catch (e) {
        console.log("pickRepForSession failed, fallback to org-level account:", e);
      }
    }

    // 1) choose google account
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

    // 2) create Google calendar event
    // ✅ FIX: do NOT add organizer as an attendee
    const event: any = await ctx.runAction(api.private.calendar.createEventForOrgUser, {
      organizationId,
      userId: acct.userId,
      summary: `Demo with ${attendeeName}`,
      description: descriptionLines.join("\n"),
      startIso: new Date(start).toISOString(),
      endIso: new Date(end).toISOString(),
      attendees: [{ email: attendeeEmail, displayName: attendeeName }],
    });

    const meetingUrl: string | undefined = event?.hangoutLink ?? event?.htmlLink ?? undefined;

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

    // Salesforce — non bloquant
    try {
      await ctx.runAction(api.integrations.createSalesforceLeadAndEvent, {
        organizationId,
        attendeeName,
        attendeeEmail,
        attendeePhone,
        attendeeCompany,
        attendeeRole,
        attendeeDescription: useCase || undefined,
        startIso: new Date(start).toISOString(),
        endIso: new Date(end).toISOString(),
        meetingUrl,
        source: "Inboundless",
      });
    } catch (e) {
      console.log("Salesforce create Lead/Event failed:", e);
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
        text: lines.join("\n"),
        dmChannelId: rep?.slackDmChannel ?? undefined,
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
          organizationId,
          bookingId: String(bookingId),
          attendeePhone,
          attendeeDescription: useCase || undefined,
        } as any);
      } catch (e) {
        console.log("sendBookingEmailToSales skipped/failed:", e);
      }
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
