import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const SYSTEM = `You are a B2B sales assistant. You receive ONLY a JSON object with facts about a website visitor (identity, traffic, page journey with approximate seconds, chat transcript excerpt, heuristic intent tags). The JSON may also include an optional "bookingForm" object with fields the visitor entered when booking a meeting (name, email, company, role, phone, use case).

Rules:
- Output ONLY valid JSON (no markdown fences) with this exact shape:
{"oneLiner":"string (max 180 chars)","summary":"string (2-4 sentences, French if visitor messages look French, else English)","bullets":["string", ... max 5],"cautions":"string or empty — note if search/pre-visit behavior cannot be inferred from data"}
- Never invent facts: no Google search counts, no "many searches" unless explicitly in the JSON.
- If company is missing, say so indirectly or omit.
- Traffic: describe referrer/UTM only from provided fields; if unknown, say "direct or unknown".
- Be specific about what they did on-site using page list and chat.
- If "bookingForm" is present, weave those fields into the oneLiner/summary/bullets (this is a demo/meeting booking context — be precise about who booked and why).`;

function parseAiJson(raw: string): {
  oneLiner: string;
  summary: string;
  bullets: string[];
  cautions?: string;
} {
  let t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (fence) t = fence[1]!.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  const parsed = JSON.parse(t) as Record<string, unknown>;
  const oneLiner = String(parsed.oneLiner ?? "").slice(0, 220);
  const summary = String(parsed.summary ?? "");
  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
    : [];
  const cautions = parsed.cautions != null ? String(parsed.cautions) : "";
  return { oneLiner, summary, bullets, cautions };
}

export function formatLeadSummaryMarkdown(p: {
  oneLiner: string;
  summary: string;
  bullets: string[];
  cautions?: string;
}): string {
  const lines: string[] = [];
  if (p.oneLiner) lines.push(`*${p.oneLiner}*`);
  lines.push("");
  lines.push(p.summary);
  if (p.bullets.length) {
    lines.push("");
    p.bullets.forEach((b) => lines.push(`• ${b}`));
  }
  if (p.cautions?.trim()) {
    lines.push("");
    lines.push(`_Note:_ ${p.cautions.trim()}`);
  }
  return lines.join("\n").trim();
}

/** Build structured JSON for the model (no PII beyond what sales already see). */
export function buildLeadSummaryInputPayload(input: {
  visitor: Record<string, unknown>;
  traffic: Record<string, unknown>;
  pageStays: Array<{ url: string; title?: string; approxSeconds: number }>;
  snapshotTimeline: Array<{ ts: number; iso: string; pageUrl?: string; title?: string }>;
  chatLines: string[];
  intentHeuristic: string;
  /** Booking form fields — makes meeting-booking emails more precise than escalation-only summaries. */
  bookingForm?: {
    attendeeName: string;
    attendeeEmail: string;
    company?: string;
    role?: string;
    phone?: string;
    useCase?: string;
  };
}): string {
  return JSON.stringify(input, null, 0);
}

export type LeadSummaryAiResult =
  | {
      ok: true;
      markdown: string;
      structured: {
        oneLiner: string;
        summary: string;
        bullets: string[];
        cautions?: string;
      };
    }
  | { ok: false; error: string };

export const generateLeadSummaryAi = internalAction({
  args: {
    payloadJson: v.string(),
  },
  handler: async (_ctx, { payloadJson }): Promise<LeadSummaryAiResult> => {
    try {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        temperature: 0.28,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Input JSON:\n${payloadJson}\n\nRespond with JSON only.`,
          },
        ],
      });
      const parsed = parseAiJson(text);
      const markdown = formatLeadSummaryMarkdown(parsed);
      return { ok: true as const, markdown, structured: parsed };
    } catch (e) {
      console.error("[leadSummaryAi]", e);
      return { ok: false as const, error: String(e) };
    }
  },
});
