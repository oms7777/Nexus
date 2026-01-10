// packages/backend/convex/private/notifications.ts
import { action, query, mutation } from "../_generated/server";
import { v } from "convex/values";

/** Format helper (pas de lib externe) */
function fmt(dt: Date) {
  return dt.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** FROM sûr pour Resend (fallback valide si domaine pas configuré) */
function resolveFromEmail(): string {
  const envFrom = process.env.RESEND_FROM_EMAIL?.trim();
  if (envFrom && /@/.test(envFrom)) {
    // accepte "email@domaine" OU "Name <email@domaine>"
    return envFrom.includes("<") ? envFrom : `Nexus <${envFrom}>`;
  }
  // Fallback recommandé par Resend (pas besoin de domaine vérifié)
  return "Inboundless <notifications@inboundless.co>";
}

function bookingEmailHTML(args: {
  attendeeName: string;
  attendeeEmail: string;
  attendeeCompany?: string;
  attendeeRole?: string;
  startIso: string;
  endIso: string;
  meetingUrl?: string;
  organizationId: string;
  bookingId: string;
  conversationUrl?: string;
}) {
  const {
    attendeeName,
    attendeeEmail,
    attendeeCompany,
    attendeeRole,
    startIso,
    endIso,
    meetingUrl,
    organizationId,
    bookingId,
    conversationUrl,
  } = args;

  const start = new Date(startIso);
  const end = new Date(endIso);

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#0f172a">
    <h2 style="margin:0 0 12px">🗓️ New meeting booked</h2>
    <p style="margin:4px 0 12px">Organisation: <strong>${organizationId}</strong></p>

    <table style="border-collapse:collapse;width:100%;max-width:640px">
      <tbody>
        <tr>
          <td style="padding:6px 0;width:140px;color:#64748b">Client</td>
          <td style="padding:6px 0"><strong>${attendeeName}</strong> &lt;${attendeeEmail}&gt;</td>
        </tr>
        ${attendeeCompany ? `<tr><td style="padding:6px 0;color:#64748b">Company</td><td style="padding:6px 0">${attendeeCompany}</td></tr>` : ""}
        ${attendeeRole ? `<tr><td style="padding:6px 0;color:#64748b">Role</td><td style="padding:6px 0">${attendeeRole}</td></tr>` : ""}
        <tr>
          <td style="padding:6px 0;color:#64748b">When</td>
          <td style="padding:6px 0">${fmt(start)} → ${fmt(end)}</td>
        </tr>
        ${meetingUrl ? `<tr><td style="padding:6px 0;color:#64748b">Link</td><td style="padding:6px 0"><a href="${meetingUrl}">${meetingUrl}</a></td></tr>` : ""}
        <tr>
          <td style="padding:6px 0;color:#64748b">Booking ID</td>
          <td style="padding:6px 0">${bookingId}</td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:16px">
      ${
        conversationUrl
          ? `<a href="${conversationUrl}" style="display:inline-block;background:#0ea5e9;color:white;padding:10px 14px;border-radius:10px;text-decoration:none">Ouvrir la conversation</a>`
          : ""
      }
    </div>
  </div>`;
}

export const sendBookingEmailToSales = action({
  args: {
    to: v.string(), // email du sales (owner du calendrier)
    attendeeName: v.string(),
    attendeeEmail: v.string(),
    attendeeCompany: v.optional(v.string()),
    attendeeRole: v.optional(v.string()),
    attendeePhone: v.optional(v.string()),         
    attendeeDescription: v.optional(v.string()),
    startIso: v.string(),
    endIso: v.string(),
    meetingUrl: v.optional(v.string()),
    organizationId: v.string(),
    bookingId: v.string(),
    conversationUrl: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      console.log("RESEND_API_KEY missing — skipping sales email");
      return { ok: false, skipped: true, reason: "missing RESEND_API_KEY" as const };
    }

    const from = resolveFromEmail();
    const subject = `New demo booked — ${args.attendeeName}`;
    const html = bookingEmailHTML(args);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("RESEND_ERROR", res.status, body);
      // On ne casse pas le booking
      return { ok: false, skipped: true, reason: `RESEND_${res.status}` as const, detail: body };
    }

    const json = await res.json().catch(() => ({}));
    return { ok: true, id: json?.id };
  },
});

/* ------------------------------------------------------------------ */
/*  User in-app notification preferences                              */
/* ------------------------------------------------------------------ */

export const meNotificationPrefs = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const doc = await ctx.db
      .query("userNotificationPrefs")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .unique();

    if (!doc) {
      // valeurs par défaut
      return {
        showBadges: true,
        playSound: true,
        autoOpenConversation: false,
      };
    }

    return {
      showBadges: doc.showBadges ?? true,
      playSound: doc.playSound ?? true,
      autoOpenConversation: doc.autoOpenConversation ?? false,
    };
  },
});

export const saveMeNotificationPrefs = mutation({
  args: {
    showBadges: v.boolean(),
    playSound: v.boolean(),
    autoOpenConversation: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("UNAUTHENTICATED");
    }

    const existing = await ctx.db
      .query("userNotificationPrefs")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("userNotificationPrefs", {
      userId: identity.subject,
      ...args,
      updatedAt: now,
    });
    return id;
  },
});
