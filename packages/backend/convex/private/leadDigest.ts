import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MessageDoc } from "@convex-dev/agent";
import { supportAgent } from "../system/ai/agents/supportAgent";
import { sanitizeVisitorAssistantText } from "../lib/sanitizeVisitorAssistantText";

export type PageStay = {
  url: string;
  title?: string;
  approxSeconds: number;
};

/** One chat line with Convex message time — for CRM / client-readable exports. */
export type ChatMessageWithTimestamp = {
  role: "visitor" | "assistant" | "tool";
  /** ISO 8601 */
  at: string;
  /** Unix ms (Convex `_creationTime` on the message doc) */
  atMs: number;
  text: string;
};

/** Multiline transcript: `[ISO] Visitor: …` — same order as `chatMessages`. */
export function formatTranscriptPlainText(messages: ChatMessageWithTimestamp[]): string {
  const label = (r: ChatMessageWithTimestamp["role"]) =>
    r === "visitor" ? "Visitor" : r === "tool" ? "Tool" : "Assistant";
  return messages.map((m) => `[${m.at}] ${label(m.role)}: ${m.text}`).join("\n");
}

/** Return type of `getEscalationDigestPayload` — explicit to avoid circular inference in actions. */
export type EscalationDigestPayload =
  | { ok: false; reason: "conversation_not_found" | "session_not_found" }
  | {
      ok: true;
      organizationId: string;
      conversationId: Id<"conversations">;
      contactSessionId: Id<"contactSessions">;
      assignedRepUserId: string | null;
      visitor: {
        name?: string;
        email?: string;
        phone?: string;
        country?: string;
        referrer?: string;
        landingUrl?: string;
      };
      traffic: {
        utmSource?: string;
        metadataPagesSample: string[];
      };
      pageStays: PageStay[];
      snapshotTimeline: Array<{ ts: number; iso: string; pageUrl?: string; title?: string }>;
      chatLines: string[];
      /** Chronological (oldest first). Prefer this over `chatLines` for audits / clients. */
      chatMessages: ChatMessageWithTimestamp[];
      intent: string;
    };

function normalizeUrl(raw: string | undefined): string {
  if (!raw?.trim()) return "(unknown page)";
  try {
    const u = new URL(raw);
    return `${u.hostname}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return raw.trim().slice(0, 200);
  }
}

/** Collapse snapshot timeline into per-page approximate dwell (time until next snapshot). */
export function buildPageStaysFromSnapshots(
  rows: Array<{ ts: number; pageUrl?: string; title?: string }>,
  endTs: number,
): PageStay[] {
  const sorted = [...rows].sort((a, b) => a.ts - b.ts);
  if (sorted.length === 0) return [];

  const stays: PageStay[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const next = sorted[i + 1];
    const start = cur.ts;
    const end = next?.ts ?? endTs;
    const ms = Math.max(0, end - start);
    const approxSeconds = Math.min(3600, Math.round(ms / 1000));
    const url = normalizeUrl(cur.pageUrl);
    const title = cur.title?.trim() || undefined;
    const last = stays[stays.length - 1];
    if (last && last.url === url && title === last.title) {
      last.approxSeconds += approxSeconds;
    } else {
      stays.push({ url, title, approxSeconds });
    }
  }
  return stays;
}

/** Flatten AI SDK / agent message parts to plain text for email & digest. */
function flattenContentParts(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const out: string[] = [];
  for (const p of content as any[]) {
    if (typeof p?.text === "string") out.push(p.text);
    else if (p?.type === "text" && typeof p?.text === "string") out.push(p.text);
    else if (p?.type === "reasoning" && typeof p?.text === "string") out.push(p.text);
  }
  return out.join("");
}

function extractMessageText(doc: any): string {
  const msg = doc?.message;
  const role = msg?.role ?? doc?.role;
  const raw =
    typeof msg?.content === "string"
      ? msg.content
      : flattenContentParts(msg?.content);
  const text = role === "assistant" ? sanitizeVisitorAssistantText(raw) : (raw ?? "").trim();
  return text.replace(/\s+/g, " ").trim();
}

function guessIntentFromText(blob: string): string {
  const t = blob.toLowerCase();
  const tags: string[] = [];
  if (/price|pricing|plan|cost|€|\$|subscription/.test(t)) tags.push("pricing");
  if (/human|someone|person|talk to|sales|rep|agent/.test(t)) tags.push("human-handoff");
  if (/book|demo|meeting|calendar|slot/.test(t)) tags.push("booking");
  if (/support|bug|issue|error/.test(t)) tags.push("support");
  return tags.length ? tags.join(", ") : "general";
}

/** Latest conversation for a contact session (widget chat), scoped by org. */
export const getLatestConversationIdForSession = internalQuery({
  args: {
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
  },
  handler: async (ctx, { organizationId, contactSessionId }) => {
    const session = await ctx.db.get(contactSessionId);
    if (!session || session.organizationId !== organizationId) return null;
    const conv = await ctx.db
      .query("conversations")
      .withIndex("by_contact_session_id", (q) => q.eq("contactSessionId", contactSessionId))
      .order("desc")
      .first();
    return conv?._id ?? null;
  },
});

export const getEscalationDigestPayload = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { conversationId }) => {
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) return { ok: false as const, reason: "conversation_not_found" as const };

    const session = await ctx.db.get(conversation.contactSessionId);
    if (!session) return { ok: false as const, reason: "session_not_found" as const };

    const organizationId = conversation.organizationId;
    const threadId = conversation.threadId;

    const snapRows = await ctx.db
      .query("sessionSnapshots")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .order("asc")
      .take(80);

    const endTs = Math.max(Date.now(), conversation.escalatedAt ?? Date.now(), session.expiresAt);
    const pageStays = buildPageStaysFromSnapshots(
      snapRows.map((r) => ({ ts: r.ts, pageUrl: r.pageUrl, title: r.title })),
      endTs,
    );

    const collected: string[] = [];
    const collectedStructured: ChatMessageWithTimestamp[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 40; i++) {
      const page = await supportAgent.listMessages(ctx, {
        threadId,
        paginationOpts: { numItems: 50, cursor },
      });
      for (const doc of page.page) {
        const r = (doc as any)?.message?.role as string | undefined;
        const roleLabel =
          r === "user" ? "Visitor" : r === "tool" ? "Tool" : "Assistant";
        const text = extractMessageText(doc);
        if (!text) continue;
        collected.push(`${roleLabel}: ${text}`);
        const role: ChatMessageWithTimestamp["role"] =
          r === "user" ? "visitor" : r === "tool" ? "tool" : "assistant";
        const atMs =
          typeof (doc as MessageDoc)._creationTime === "number"
            ? (doc as MessageDoc)._creationTime
            : conversation._creationTime;
        collectedStructured.push({
          role,
          text,
          atMs,
          at: new Date(atMs).toISOString(),
        });
      }
      cursor = page.continueCursor;
      if (cursor === null) break;
    }

    const allLines = collected.reverse();
    const chatMessages = collectedStructured.reverse();
    const transcript = allLines.join("\n");
    const intent = guessIntentFromText(transcript);

    const md = session.metadata as Record<string, unknown> | undefined;
    const visitorName = session.name?.trim();
    const visitorEmail = session.email?.trim();
    const visitorPhone = session.phone?.trim();
    const country = typeof md?.countryCode === "string" ? md.countryCode : undefined;
    const referrer = typeof md?.referrer === "string" ? md.referrer : undefined;
    const landingUrl = typeof md?.currentUrl === "string" ? md.currentUrl : undefined;
    const utmSource =
      typeof md?.utmSource === "string" && md.utmSource.trim()
        ? md.utmSource.trim()
        : undefined;
    const metadataPages = Array.isArray(md?.pages) ? (md!.pages as string[]).filter(Boolean).slice(0, 30) : [];

    const snapshotTimeline = snapRows.map((r) => ({
      ts: r.ts,
      iso: new Date(r.ts).toISOString(),
      pageUrl: r.pageUrl,
      title: r.title,
    }));

    return {
      ok: true as const,
      organizationId,
      conversationId,
      contactSessionId: session._id,
      assignedRepUserId: conversation.assignedRepUserId ?? null,
      visitor: {
        name: visitorName,
        email: visitorEmail,
        phone: visitorPhone,
        country,
        referrer,
        landingUrl,
      },
      traffic: {
        utmSource,
        metadataPagesSample: metadataPages,
      },
      pageStays,
      snapshotTimeline,
      chatLines: allLines,
      chatMessages,
      intent,
    };
  },
});
