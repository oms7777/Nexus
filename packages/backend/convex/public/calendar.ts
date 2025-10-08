// packages/backend/convex/public/calendar.ts
import { query, action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

/* -------------------------------------------------------------
 * Compte Google connecté pour une org (simple, pas d'auth)
 * ----------------------------------------------------------- */
export const getAccount = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const acct = await ctx.db
      .query("calendarAccounts")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .first();

    if (!acct) return null;
    return { userId: acct.userId, email: acct.email ?? "" };
  },
});

/* -------------------------------------------------------------
 * Settings (version B) du propriétaire de l’account de l’org
 * ----------------------------------------------------------- */
export const getSettingsForOrg = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const acct = await ctx.db
      .query("calendarAccounts")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .first();
    if (!acct) return null;

    const settings = await ctx.db
      .query("calendarSettings")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", acct.userId)
      )
      .unique();

    return settings;
  },
});

/* -------------------------------------------------------------
 * Liste des créneaux (N jours) en excluant le busy Google
 * ----------------------------------------------------------- */
export const listSlots = action({
  args: {
    organizationId: v.string(),
    days: v.number(),        // ex. 7
    slotMinutes: v.number(), // ex. 30
  },
  handler: async (ctx, { organizationId, days, slotMinutes }) => {
    // 1) account + settings via queries publiques
    const acct = await ctx.runQuery(api.public.calendar.getAccount, { organizationId });
    if (!acct) return [] as Array<{ start: number; end: number }>;

    const settings = await ctx.runQuery(api.public.calendar.getSettingsForOrg, { organizationId });

    type Win = { day: number; start: string; end: string };
    const weekly: Win[] =
      settings?.weekly ?? [
        { day: 1, start: "09:00", end: "17:00" },
        { day: 2, start: "09:00", end: "17:00" },
        { day: 3, start: "09:00", end: "17:00" },
        { day: 4, start: "09:00", end: "17:00" },
        { day: 5, start: "09:00", end: "17:00" },
      ];

    const durationMin = settings?.durationMin ?? slotMinutes;
    const bufferMin = settings?.bufferMin ?? 0;

    // 2) périodes occupées Google (NO-AUTH variant)
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

    // map JS dow (0..6) -> notre 1..7 (7 = dimanche)
    const jsToOurDow = (jsDay: number) => (jsDay === 0 ? 7 : jsDay);

    const getWindowForDate = (d: Date) => {
      const ourDow = jsToOurDow(d.getDay());
      const rec = weekly.find((w) => w.day === ourDow);
      if (!rec) return null;

      const mkTs = (hhmm: string) => {
        const [h, m] = hhmm.split(":").map(Number);
        const nd = new Date(d);
        nd.setHours(h, m, 0, 0);
        return nd.getTime();
      };

      return { startMs: mkTs(rec.start), endMs: mkTs(rec.end) };
    };

    const stepMs = slotMinutes * 60 * 1000;
    const durationMs = durationMin * 60 * 1000;
    const bufferMs = bufferMin * 60 * 1000;

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

    // (facultatif) log non bloquant: slots chargés
    try {
      await ctx.runMutation(api.public.analytics.log, {
        organizationId,
        type: "calendar_slots_loaded",
        meta: { count: Math.min(slots.length, 50), days, slotMinutes },
      });
    } catch (e) {
      console.log("analytics.log(calendar_slots_loaded) failed:", e);
    }

    return slots.slice(0, 50);
  },
});

/* -------------------------------------------------------------
 * Book: crée l’event Google + enregistre le booking + log analytics
 * ----------------------------------------------------------- */
export const bookSlot = action({
  args: {
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
    attendeeName: v.string(),
    attendeeEmail: v.string(),
    start: v.number(),
    end: v.number(),
    attendeeCompany: v.optional(v.string()),
    attendeeRole: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      organizationId,
      contactSessionId,
      attendeeName,
      attendeeEmail,
      start,
      end,
      attendeeCompany,
      attendeeRole,
    }
  ): Promise<{ bookingId: Id<"calendarBookings">; meetingUrl?: string }> => {
    // 1) account
    const acct = await ctx.runQuery(api.public.calendar.getAccount, { organizationId });
    if (!acct) throw new Error("No connected calendar for this organization");

    // 2) créer l’event Google (NO-AUTH variant)
    const descriptionLines = [
      `Booked via widget (org: ${organizationId})`,
      `Name: ${attendeeName}`,
      `Email: ${attendeeEmail}`,
      attendeeCompany ? `Company: ${attendeeCompany}` : null,
      attendeeRole ? `Role: ${attendeeRole}` : null,
    ].filter(Boolean);

    const event: any = await ctx.runAction(api.private.calendar.createEventForOrgUser, {
      organizationId,
      userId: acct.userId,
      summary: `Demo with ${attendeeName}`,
      description: descriptionLines.join("\n"),
      startIso: new Date(start).toISOString(),
      endIso: new Date(end).toISOString(),
      attendees: [
        { email: attendeeEmail, displayName: attendeeName },
        { email: acct.email || "", displayName: "Organizer" }, // le sales reçoit l’invite
      ],
    });

    const meetingUrl: string | undefined = event?.hangoutLink ?? event?.htmlLink ?? undefined;

    // 3) enregistrer le booking
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
      },
    });

    // 4) notifier le sales (email interne) — non bloquant
    const SALES_NOTIFY_EMAIL = process.env.SALES_NOTIFY_EMAIL || acct.email; // fallback
    if (SALES_NOTIFY_EMAIL) {
      try {
        await ctx.runAction(api.private.notifications.sendBookingEmailToSales, {
          to: SALES_NOTIFY_EMAIL,
          attendeeName,
          attendeeEmail,
          attendeeCompany,
          attendeeRole,
          startIso: new Date(start).toISOString(),
          endIso: new Date(end).toISOString(),
          meetingUrl,
          organizationId,
          bookingId: String(bookingId),
        });
      } catch (e) {
        console.log("sendBookingEmailToSales skipped/failed:", e);
      }
    }

    // 5) analytics — non bloquant
    try {
      await ctx.runMutation(api.public.analytics.log, {
        organizationId,
        type: "meeting_booked",
        sessionId: contactSessionId,
        meta: {
          bookingId,
          attendeeName,
          attendeeEmail,
          attendeeCompany,
          attendeeRole,
          start,
          end,
          meetingUrl,
          organizerEmail: acct.email ?? null,
        },
      });
    } catch (e) {
      console.log("analytics.log(meeting_booked) failed:", e);
    }

    return { bookingId, meetingUrl };
  },
});

/* -------------------------------------------------------------
 * Helpers (facultatif)
 * ----------------------------------------------------------- */
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
