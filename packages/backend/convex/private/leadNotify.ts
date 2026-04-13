import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { buildLeadSummaryInputPayload, type LeadSummaryAiResult } from "./leadSummaryAi";
import type { EscalationDigestPayload } from "./leadDigest";

function appOrigin(): string {
  const o = process.env.APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (o && /^https?:\/\//i.test(o)) return o.replace(/\/$/, "");
  return "https://app.inboundless.co";
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dashboardConversationHref(conversationId: string): string {
  return `${appOrigin()}/conversations/${conversationId}`;
}

/** Light markdown → HTML for AI summary in email (bold only). */
function aiMarkdownToEmailHtml(md: string): string {
  const t = truncate(md, 4500);
  let s = escapeHtml(t);
  s = s.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+?)\*/g, "<strong>$1</strong>");
  return s.replace(/\n/g, "<br/>");
}

function takeLastLines(lines: string[], max: number): string[] {
  if (lines.length <= max) return lines;
  return lines.slice(-max);
}

function formatSlackDigest(payload: {
  visitor: {
    name?: string;
    email?: string;
    country?: string;
    referrer?: string;
    landingUrl?: string;
  };
  pageStays: Array<{ url: string; title?: string; approxSeconds: number }>;
  chatLines: string[];
  intent: string;
  conversationId: string;
  contactSessionId: string;
  aiMarkdown?: string;
}): string {
  const lines: string[] = [];
  lines.push("🎯 *Visitor escalated — lead summary*");
  lines.push("");

  const convUrl = dashboardConversationHref(payload.conversationId);
  lines.push(`<${convUrl}|Open full conversation in Inboundless>`);
  lines.push("");

  const v = payload.visitor;
  lines.push("*Visitor*");
  if (v.name) lines.push(`• Name: ${v.name}`);
  if (v.email) lines.push(`• Email: ${v.email}`);
  if (v.country) lines.push(`• Country: ${v.country}`);
  if (v.referrer) lines.push(`• Referrer: ${truncate(v.referrer, 200)}`);
  if (v.landingUrl) lines.push(`• First URL (metadata): ${truncate(v.landingUrl, 200)}`);
  lines.push("");

  if (payload.aiMarkdown?.trim()) {
    lines.push("*Lead summary (AI)*");
    lines.push(truncate(payload.aiMarkdown.trim(), 2400));
    lines.push("");
  }

  const recentChat = takeLastLines(payload.chatLines, 24);
  lines.push("*Recent chat (latest lines only)*");
  lines.push(
    recentChat.length ? truncate(recentChat.join("\n"), 2800) : "_No messages_",
  );
  lines.push("");

  lines.push("*Pages visited (approx. dwell)*");
  if (payload.pageStays.length === 0) {
    lines.push("• _No page snapshots in this session yet_");
  } else {
    for (const p of payload.pageStays) {
      const title = p.title ? ` — _${truncate(p.title, 80)}_` : "";
      lines.push(`• ${p.url}${title} — *${p.approxSeconds}s*`);
    }
  }
  lines.push("");

  lines.push(`*Intent (heuristic)*: ${payload.intent}`);
  lines.push("");
  lines.push(`_session=${payload.contactSessionId}_`);

  return truncate(lines.join("\n"), 12000);
}

/** Slack appendix for calendar booking notifications (same data as escalation digest, shorter header). */
export function formatSlackBookingLeadAppend(payload: {
  visitor: {
    name?: string;
    email?: string;
    country?: string;
    referrer?: string;
    landingUrl?: string;
  };
  pageStays: Array<{ url: string; title?: string; approxSeconds: number }>;
  chatLines: string[];
  intent: string;
  conversationId: string;
  contactSessionId: string;
  aiMarkdown?: string;
}): string {
  const lines: string[] = [];
  lines.push("📍 *Lead context (visit & chat)*");
  lines.push("");

  const convUrl = dashboardConversationHref(payload.conversationId);
  lines.push(`<${convUrl}|Open full conversation in Inboundless>`);
  lines.push("");

  const v = payload.visitor;
  lines.push("*Visitor*");
  if (v.name) lines.push(`• Name: ${v.name}`);
  if (v.email) lines.push(`• Email: ${v.email}`);
  if (v.country) lines.push(`• Country: ${v.country}`);
  if (v.referrer) lines.push(`• Referrer: ${truncate(v.referrer, 200)}`);
  if (v.landingUrl) lines.push(`• First URL: ${truncate(v.landingUrl, 200)}`);
  lines.push("");

  if (payload.aiMarkdown?.trim()) {
    lines.push("*Lead summary (AI)*");
    lines.push(truncate(payload.aiMarkdown.trim(), 2000));
    lines.push("");
  }

  const recentChat = takeLastLines(payload.chatLines, 20);
  lines.push("*Recent chat (latest lines only)*");
  lines.push(
    recentChat.length ? truncate(recentChat.join("\n"), 2400) : "_No messages_",
  );
  lines.push("");

  lines.push("*Pages (approx. dwell)*");
  if (payload.pageStays.length === 0) {
    lines.push("• _No page snapshots yet_");
  } else {
    for (const p of payload.pageStays.slice(0, 12)) {
      const title = p.title ? ` — _${truncate(p.title, 60)}_` : "";
      lines.push(`• ${p.url}${title} — *${p.approxSeconds}s*`);
    }
  }
  lines.push("");

  lines.push(`*Intent (heuristic)*: ${payload.intent}`);
  lines.push("");
  lines.push(`_conv=${payload.conversationId}_`);

  return truncate(lines.join("\n"), 9000);
}

/** Shared HTML block for lead emails: AI summary, visitor, pages, intent, link to full chat in app (no full transcript). */
export function formatLeadContextEmailSection(
  payload: {
    visitor: {
      name?: string;
      email?: string;
      country?: string;
      referrer?: string;
      landingUrl?: string;
    };
    pageStays: Array<{ url: string; title?: string; approxSeconds: number }>;
    chatLines: string[];
    intent: string;
    aiMarkdown?: string;
  },
  opts: { conversationId: string },
): string {
  const v = payload.visitor;
  const rows = payload.pageStays
    .map(
      (p) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top">${escapeHtml(p.url)}</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${p.title ? escapeHtml(p.title) : "—"}</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${p.approxSeconds}s</td></tr>`,
    )
    .join("");

  const conversationUrl = dashboardConversationHref(opts.conversationId);

  const aiBlock = payload.aiMarkdown?.trim()
    ? `<h3 style="margin:16px 0 8px;font-size:15px;color:#334155">Lead summary (AI)</h3>
       <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;font-size:14px;line-height:1.45">${aiMarkdownToEmailHtml(payload.aiMarkdown)}</div>`
    : "";

  const conversationBlock = `<h3 style="margin:20px 0 8px;font-size:15px;color:#334155">Conversation</h3>
    <p style="margin:0 0 10px;font-size:14px">
      <a href="${escapeHtml(conversationUrl)}" style="display:inline-block;background:#0ea5e9;color:white;padding:10px 14px;border-radius:10px;text-decoration:none;font-weight:600">Open full chat in Inboundless</a>
    </p>
    <p style="margin:0;font-size:12px;color:#64748b">The complete visitor thread (including retries and errors) is in the app — we don’t paste the full transcript here to keep this email readable.</p>`;

  return `${aiBlock}
    <h3 style="margin:20px 0 8px;font-size:15px;color:#334155">Visitor</h3>
    <table style="border-collapse:collapse;width:100%">
      ${v.name ? `<tr><td style="padding:4px 0;color:#64748b;width:120px">Name</td><td>${escapeHtml(v.name)}</td></tr>` : ""}
      ${v.email ? `<tr><td style="padding:4px 0;color:#64748b">Email</td><td>${escapeHtml(v.email)}</td></tr>` : ""}
      ${v.country ? `<tr><td style="padding:4px 0;color:#64748b">Country</td><td>${escapeHtml(v.country)}</td></tr>` : ""}
      ${v.referrer ? `<tr><td style="padding:4px 0;color:#64748b">Referrer</td><td>${escapeHtml(truncate(v.referrer, 300))}</td></tr>` : ""}
    </table>
    <h3 style="margin:16px 0 8px;font-size:15px;color:#334155">Pages visited (approx.)</h3>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr style="background:#f8fafc"><th align="left" style="padding:8px">URL</th><th align="left" style="padding:8px">Title</th><th align="left" style="padding:8px">~Seconds</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="3" style="padding:8px;color:#64748b">No snapshots</td></tr>`}</tbody>
    </table>
    <p style="margin:12px 0 6px"><strong>Intent (heuristic):</strong> ${escapeHtml(payload.intent)}</p>
    ${conversationBlock}`;
}

function formatEmailHtml(
  payload: {
    visitor: {
      name?: string;
      email?: string;
      country?: string;
      referrer?: string;
      landingUrl?: string;
    };
    pageStays: Array<{ url: string; title?: string; approxSeconds: number }>;
    chatLines: string[];
    intent: string;
    aiMarkdown?: string;
  },
  conversationId: string,
): string {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:720px">
    <h2 style="margin:0 0 12px">Visitor escalated — lead summary</h2>
    ${formatLeadContextEmailSection(payload, { conversationId })}
  </div>`;
}

type BookingLeadExtrasOk = {
  ok: true;
  slackAppend: string;
  emailHtmlFragment: string;
};

export const buildBookingLeadExtras = internalAction({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { conversationId }): Promise<{ ok: false } | BookingLeadExtrasOk> => {
    const data: EscalationDigestPayload = await ctx.runQuery(internal.private.leadDigest.getEscalationDigestPayload, {
      conversationId,
    });
    if (!data.ok) {
      return { ok: false as const };
    }

    const aiFields: { aiLeadSummary?: string; aiLeadSummaryAt?: number } | null = await ctx.runQuery(
      internal.private.visitorJourneyHelpers.getConversationAiFields,
      {
        conversationId,
      },
    );
    let aiMarkdown: string | undefined = aiFields?.aiLeadSummary?.trim() || undefined;

    if (!aiMarkdown) {
      try {
        const payloadJson = buildLeadSummaryInputPayload({
          visitor: data.visitor,
          traffic: {
            utmSource: data.traffic.utmSource,
            metadataPagesSample: data.traffic.metadataPagesSample,
            referrer: data.visitor.referrer,
            landingUrl: data.visitor.landingUrl,
          },
          pageStays: data.pageStays,
          snapshotTimeline: data.snapshotTimeline.slice(0, 50),
          chatLines: data.chatLines,
          intentHeuristic: data.intent,
        });

        const ai: LeadSummaryAiResult = await ctx.runAction(internal.private.leadSummaryAi.generateLeadSummaryAi, {
          payloadJson,
        });

        if (ai.ok && ai.markdown?.trim()) {
          aiMarkdown = ai.markdown;
          await ctx.runMutation(internal.private.leadSummaryStore.saveAiLeadSummary, {
            conversationId,
            markdown: ai.markdown,
          });
        }
      } catch (e) {
        console.log("[leadNotify] booking lead AI skipped:", e);
      }
    }

    const section: Parameters<typeof formatLeadContextEmailSection>[0] = {
      visitor: data.visitor,
      pageStays: data.pageStays,
      chatLines: data.chatLines,
      intent: data.intent,
      aiMarkdown,
    };

    return {
      ok: true as const,
      slackAppend: formatSlackBookingLeadAppend({
        ...section,
        conversationId: String(data.conversationId),
        contactSessionId: String(data.contactSessionId),
        aiMarkdown,
      }),
      emailHtmlFragment: formatLeadContextEmailSection(section, {
        conversationId: String(conversationId),
      }),
    };
  },
});

export const sendEscalationDigest = internalAction({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (
    ctx,
    { conversationId },
  ): Promise<
    | { ok: false; reason: "conversation_not_found" | "session_not_found" | "no_assigned_rep" }
    | { ok: true }
  > => {
    const data: EscalationDigestPayload = await ctx.runQuery(internal.private.leadDigest.getEscalationDigestPayload, {
      conversationId,
    });

    if (!data.ok) {
      console.log("[leadNotify] skip:", data.reason);
      return { ok: false as const, reason: data.reason };
    }

    const repUserId = data.assignedRepUserId;
    if (!repUserId) {
      console.log("[leadNotify] no assigned rep — skip notifications");
      return { ok: false as const, reason: "no_assigned_rep" as const };
    }

    const acct = await ctx.runQuery(api.public.calendar.getAccount, {
      organizationId: data.organizationId,
      userId: repUserId,
    });
    const salesEmail = acct?.email?.trim() || null;

    const rep = await ctx.runQuery(api.team.getRepForVisitor, {
      organizationId: data.organizationId,
      contactSessionId: data.contactSessionId,
      userId: repUserId,
    });

    let aiMarkdown: string | undefined;
    try {
      const payloadJson = buildLeadSummaryInputPayload({
        visitor: data.visitor,
        traffic: {
          utmSource: data.traffic.utmSource,
          metadataPagesSample: data.traffic.metadataPagesSample,
          referrer: data.visitor.referrer,
          landingUrl: data.visitor.landingUrl,
        },
        pageStays: data.pageStays,
        snapshotTimeline: data.snapshotTimeline.slice(0, 50),
        chatLines: data.chatLines,
        intentHeuristic: data.intent,
      });

      const ai: LeadSummaryAiResult = await ctx.runAction(internal.private.leadSummaryAi.generateLeadSummaryAi, {
        payloadJson,
      });

      if (ai.ok && ai.markdown?.trim()) {
        aiMarkdown = ai.markdown;
        await ctx.runMutation(internal.private.leadSummaryStore.saveAiLeadSummary, {
          conversationId,
          markdown: ai.markdown,
        });
      }
    } catch (e) {
      console.log("[leadNotify] AI summary skipped:", e);
    }

    const slackText = formatSlackDigest({
      visitor: data.visitor,
      pageStays: data.pageStays,
      chatLines: data.chatLines,
      intent: data.intent,
      conversationId: data.conversationId,
      contactSessionId: String(data.contactSessionId),
      aiMarkdown,
    });

    try {
      await ctx.runAction(api.integrations.sendSlackMessage, {
        organizationId: data.organizationId,
        text: slackText,
        dmChannelId: rep?.slackDmChannel ?? undefined,
        slackUserId: rep?.slackUserId ?? undefined,
      });
    } catch (e) {
      console.log("[leadNotify] Slack failed:", e);
    }

    if (salesEmail) {
      try {
        await ctx.runAction(api.private.notifications.sendLeadEscalationEmail, {
          to: salesEmail,
          subject: `Visitor escalated — ${data.visitor.name || data.visitor.email || "lead"}`,
          html: formatEmailHtml(
            {
              visitor: data.visitor,
              pageStays: data.pageStays,
              chatLines: data.chatLines,
              intent: data.intent,
              aiMarkdown,
            },
            String(data.conversationId),
          ),
        });
      } catch (e) {
        console.log("[leadNotify] email failed:", e);
      }
    }

    return { ok: true as const };
  },
});
