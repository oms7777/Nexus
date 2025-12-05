// packages/backend/convex/public/calendar.ts
import { query, action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

/* -------------------------------------------------------------
 * Compte Google connecté pour une org + user (multi-reps)
 * ----------------------------------------------------------- */
export const getAccount = query({
  args: {
    organizationId: v.string(),
    userId: v.optional(v.string()), // <- rep précis (Clerk userId)
  },
  handler: async (ctx, { organizationId, userId }) => {
    let acct: { userId: string; email?: string } | null = null;

    if (userId) {
      // 1) On tente d'abord le compte du rep
      const byUser = await ctx.db
        .query("calendarAccounts")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", organizationId).eq("userId", userId),
        )
        .unique();

      if (byUser) {
        acct = byUser;
      } else {
        // 2) Fallback back-compat : on prend "le" compte de l’org
        const byOrg = await ctx.db
          .query("calendarAccounts")
          .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
          .first();

        if (byOrg) {
          acct = byOrg;
        }
      }
    } else {
      // Cas ancien : on ne regarde que l’org
      const byOrg = await ctx.db
        .query("calendarAccounts")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .first();

      if (byOrg) {
        acct = byOrg;
      }
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
    userId: v.optional(v.string()), // <- permet de cibler le rep
  },
  handler: async (ctx, { organizationId, userId }) => {
    let effectiveUserId = userId;

    // Si userId non fourni, on se base sur le premier calendarAccount de l’org
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
        q.eq("organizationId", organizationId).eq("userId", effectiveUserId!)
      )
      .unique();

    return settings;
  },
});

/* -------------------------------------------------------------
 * Liste des créneaux (N jours) pour UN rep (userId)
 * ----------------------------------------------------------- */
export const listSlots = action({
  args: {
    organizationId: v.string(),
    userId: v.optional(v.string()), // <- rep choisi (obligatoire côté widget)
    days: v.number(), // ex. 7
    slotMinutes: v.optional(v.number()), // ex. 30
  },
  handler: async (ctx, { organizationId, userId, days, slotMinutes }) => {
    // 1) account + settings via queries publiques
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

    // durée d’un meeting choisie par le rep dans /me/calendar
    const durationMin =
      settings?.durationMin       // 1) valeur définie dans la page Calendar
      ?? slotMinutes              // 2) éventuel override passé par l'appelant
      ?? 30;                      // 3) fallback

    const bufferMin = settings?.bufferMin ?? 0;

    // On veut que chaque créneau = 1 meeting → step = duration
    const durationMs = durationMin * 60 * 1000;
    const stepMs = durationMs;
    const bufferMs = bufferMin * 60 * 1000;

    // 2) périodes occupées Google (NO-AUTH variant)
    const now = Date.now();
    const rangeEnd = now + days * 24 * 60 * 60 * 1000;

    const busy = await ctx.runAction(api.private.calendar.freeBusyForOrgUser, {
      organizationId,
      userId: acct.userId,
      timeMinIso: new Date(now).toISOString(),
      timeMaxIso: new Date(rangeEnd).toISOString(),
    });

    const overlaps = (
      aStart: number,
      aEnd: number,
      bStart: number,
      bEnd: number
    ) => aStart < bEnd && aEnd > bStart;

    const slots: Array<{ start: number; end: number }> = [];

    // map JS dow (0..6) -> notre 1..7 (7 = dimanche)
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

        const isBusy = busy.some((b) =>
          overlaps(paddedStart, paddedEnd, b.start, b.end)
        );
        if (!isBusy) slots.push({ start, end });
      }
    }

    // (facultatif) log non bloquant: slots chargés
    try {
      await ctx.runMutation(api.public.analytics.log, {
        organizationId,
        type: "calendar_slots_loaded",
        meta: {
          count: Math.min(slots.length, 50),
          days,
          slotMinutes: durationMin,
          userId: acct.userId,
        },
      });
    } catch (e) {
      console.log("analytics.log(calendar_slots_loaded) failed:", e);
    }

    return slots.slice(0, 50);
  },
});

/* -------------------------------------------------------------
 * Book: crée l’event Google + enregistre le booking + log analytics
 * + Slack notification + email au rep
 * ----------------------------------------------------------- */
export const bookSlot = action({
  args: {
    organizationId: v.string(),
    userId: v.optional(v.string()), // <- rep choisi (facultatif côté widget)
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
      userId,
      contactSessionId,
      attendeeName,
      attendeeEmail,
      start,
      end,
      attendeeCompany,
      attendeeRole,
    }
  ): Promise<{ bookingId: Id<"calendarBookings">; meetingUrl?: string }> => {
    // 0) Choisir le rep (multi-reps routing)
    let effectiveUserId = userId;

    if (!effectiveUserId) {
      try {
        const routedUserId = await ctx.runQuery(api.routing.pickRepForSession, {
          organizationId,
          contactSessionId,
        });
        if (routedUserId) {
          effectiveUserId = routedUserId;
        }
      } catch (e) {
        console.log("pickRepForSession failed, fallback to org-level account:", e);
      }
    }

    // 1) account (rep précis si trouvé / fourni)
    const acct = await ctx.runQuery(api.public.calendar.getAccount, {
      organizationId,
      userId: effectiveUserId,
    });
    if (!acct) throw new Error("No connected calendar for this organization / user");

    // 2) créer l’event Google (NO-AUTH variant)
    const descriptionLines = [
      `Booked via widget (org: ${organizationId})`,
      `Rep: ${acct.userId}`,
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

    const meetingUrl: string | undefined =
      event?.hangoutLink ?? event?.htmlLink ?? undefined;

    // 3) enregistrer le booking
    const bookingId = await ctx.runMutation(api.public.booking.create, {
      organizationId,
      contactSessionId,
      attendeeName,
      attendeeEmail,
      start,
      end,
      createdByUserId: acct.userId, // ← rep choisi
      meetingUrl,
      externalEventId: event?.id as string | undefined,
      providerData: {
        calendarId: "primary",
        company: attendeeCompany,
        role: attendeeRole,
      },
    });

    // 4) Slack notification — non bloquant
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
        attendeeCompany ? `• Company: ${attendeeCompany}` : null,
        attendeeRole ? `• Role: ${attendeeRole}` : null,
        `• When: *${dateLabel}*`,
        meetingUrl ? `• Link: ${meetingUrl}` : null,
      ].filter(Boolean);

      // 🔍 on récupère le rep (acct.userId) dans repsPresence pour voir s'il a un DM Slack
      const rep = await ctx.runQuery(api.team.getRepForOrgUser, {
        organizationId,
        userId: acct.userId,
      });

      const channelOverride = rep?.slackDmChannel;

      await ctx.runAction(api.integrations.sendSlackMessage, {
        organizationId,
        text: lines.join("\n"),
        // si le rep a un DM, on envoie là ; sinon fallback sur le defaultChannel (#general)
        channelOverride: channelOverride ?? undefined,
      });
    } catch (e) {
      console.log("Slack sendSlackMessage failed:", e);
    }

    // 5) notifier le sales (email interne) — non bloquant, envoyé au rep choisi
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
        });
      } catch (e) {
        console.log("sendBookingEmailToSales skipped/failed:", e);
      }
    }

    // 6) analytics — non bloquant
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
          organizerUserId: acct.userId,
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
