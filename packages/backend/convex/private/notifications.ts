// packages/backend/convex/private/notifications.ts
import { action, query, mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

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

function resolveAppOrigin(): string {
  const o = process.env.APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (o && /^https?:\/\//i.test(o)) return o.replace(/\/$/, "");
  return "https://app.inboundless.co";
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
  bookingId: string;
  conversationUrl?: string;
  /** Rich lead block (AI summary, journey, chat) from widget session — see `leadNotify.buildBookingLeadExtras`. */
  leadContextHtml?: string;
}) {
  const {
    attendeeName,
    attendeeEmail,
    attendeeCompany,
    attendeeRole,
    startIso,
    endIso,
    meetingUrl,
    bookingId,
    conversationUrl,
    leadContextHtml,
  } = args;

  const start = new Date(startIso);
  const end = new Date(endIso);

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#0f172a">
    <h2 style="margin:0 0 12px">🗓️ New meeting booked</h2>

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

    ${
      leadContextHtml
        ? `<div style="margin-top:24px;padding-top:20px;border-top:1px solid #e2e8f0">
      <h2 style="margin:0 0 12px;font-size:17px;color:#0f172a">Lead context (visit &amp; chat)</h2>
      ${leadContextHtml}
    </div>`
        : ""
    }

    ${
      conversationUrl && !leadContextHtml
        ? `<div style="margin-top:16px">
      <a href="${conversationUrl}" style="display:inline-block;background:#0ea5e9;color:white;padding:10px 14px;border-radius:10px;text-decoration:none">Open conversation in Inboundless</a>
    </div>`
        : ""
    }
  </div>`;
}

export const sendLeadEscalationEmail = action({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
  },
  handler: async (_ctx, args) => {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      console.log("RESEND_API_KEY missing — skipping lead escalation email");
      return { ok: false, skipped: true, reason: "missing RESEND_API_KEY" as const };
    }

    const from = resolveFromEmail();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        html: args.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("RESEND_ERROR lead escalation", res.status, body);
      return { ok: false, skipped: true, reason: `RESEND_${res.status}` as const, detail: body };
    }

    const json = await res.json().catch(() => ({}));
    return { ok: true, id: json?.id };
  },
});

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
    bookingId: v.string(),
    conversationUrl: v.optional(v.string()),
    leadContextHtml: v.optional(v.string()),
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

export const listUnseenEscalationsForMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const orgId = (identity as any).orgId as string | undefined;
    const meUserId = (identity as any).subject as string | undefined;
    if (!orgId || !meUserId) return [];

    const now = Date.now();

    const orgRole =
      ((identity as any)?.orgRole ??
        (identity as any)?.org_role ??
        (identity as any)?.organizationRole ??
        undefined) as string | undefined;
    const isAdmin = typeof orgRole === "string" && orgRole.includes("admin");

    let escalated: Array<Doc<"conversations">> = [];
    if (isAdmin) {
      const base = await ctx.db
        .query("conversations")
        .withIndex("by_status_and_organization_id", (q) =>
          q.eq("status", "escalated").eq("organizationId", orgId)
        )
        .collect();

      escalated = base
        .filter((c) => (c.lastViewedByRepAt ?? 0) < (c.escalatedAt ?? 0))
        .sort(
          (a, b) => Number(b.escalatedAt ?? b._creationTime) - Number(a.escalatedAt ?? a._creationTime)
        );
    } else {
      const base = await ctx.db
        .query("conversations")
        .withIndex("by_org_assigned_rep", (q) =>
          q.eq("organizationId", orgId).eq("assignedRepUserId", meUserId)
        )
        .collect();

      escalated = base
        .filter(
          (c) =>
            c.status === "escalated" &&
            (c.lastViewedByRepAt ?? 0) < (c.escalatedAt ?? 0)
        )
        .sort(
          (a, b) => Number(b.escalatedAt ?? b._creationTime) - Number(a.escalatedAt ?? a._creationTime)
        );
    }

    const out: Array<{
      conversationId: Id<"conversations">;
      contactSessionId: Id<"contactSessions">;
      escalatedAt: number;
      visitor: {
        name?: string;
        email?: string;
        city?: string;
        countryCode?: string;
        currentUrl?: string;
        title?: string;
        pageUrls?: string[];
        pageCount?: number;
        userAgent?: string;
        timeOnSiteMs?: number;
      };
    }> = [];

    for (const c of escalated) {
      const session = await ctx.db.get(c.contactSessionId);
      if (!session || session.organizationId !== orgId) continue;

      const md: any = session.metadata ?? {};
      const pages: string[] = Array.isArray(md.pages) ? md.pages.filter(Boolean) : [];

      out.push({
        conversationId: c._id,
        contactSessionId: c.contactSessionId,
        escalatedAt: Number(c.escalatedAt ?? c._creationTime),
        visitor: {
          name: session.name ?? undefined,
          email: session.email ?? undefined,
          city: md.city ?? undefined,
          countryCode: md.countryCode ?? undefined,
          currentUrl: md.currentUrl ?? undefined,
          title: md.title ?? undefined,
          pageUrls: pages.slice(0, 30),
          pageCount: pages.length || undefined,
          userAgent: md.userAgent ?? undefined,
          timeOnSiteMs: typeof session._creationTime === "number" ? now - session._creationTime : undefined,
        },
      });
    }

    return out;
  },
});

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
