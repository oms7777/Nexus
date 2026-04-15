/**
 * Human-readable session report for sales/support (plain text, opens in any editor).
 * Data shape matches `api.private.visitorJourney.exportJourney` response.
 */
export type SessionExportPayload = {
  exportedAt: string;
  conversationId: string;
  contactSessionId: string;
  conversation: {
    status: string;
    createdAt: string;
    escalatedAt: string | null;
  };
  visitor: { name?: string; email?: string; phone?: string };
  metadata?: Record<string, unknown>;
  transcriptPlainText: string;
  pageStaysAggregated: Array<{ url: string; title?: string; approxSeconds: number }>;
  pageTimeline: Array<{ iso: string; pageUrl?: string; title?: string }>;
  intentHeuristic: string | null;
  traffic: { utmSource?: string; metadataPagesSample: string[] } | null;
  aiLeadSummary: string | null;
  aiLeadSummaryAt: number | null;
};

function stripLightMarkdown(md: string): string {
  return md
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[_•]\s*/gm, "• ")
    .trim();
}

function line(label: string, value: string | undefined | null): string {
  if (value == null || String(value).trim() === "") return `${label}: —`;
  return `${label}: ${String(value).trim()}`;
}

export function buildSessionExportText(data: SessionExportPayload): string {
  const md = (data.metadata ?? {}) as Record<string, unknown>;
  const country =
    typeof md.countryCode === "string" && md.countryCode.trim()
      ? md.countryCode.trim()
      : undefined;
  const referrer =
    typeof md.referrer === "string" && md.referrer.trim()
      ? md.referrer.trim()
      : undefined;

  const blocks: string[] = [];

  blocks.push("INBOUNDLESS — CONVERSATION REPORT");
  blocks.push("");
  blocks.push(line("Generated", new Date(data.exportedAt).toLocaleString()));
  blocks.push(line("Conversation ID", data.conversationId));
  blocks.push(line("Session ID", data.contactSessionId));
  blocks.push("");

  blocks.push("VISITOR");
  blocks.push(line("Name", data.visitor?.name));
  blocks.push(line("Email", data.visitor?.email));
  blocks.push(line("Phone", data.visitor?.phone));
  if (country) blocks.push(line("Country (hint)", country));
  blocks.push("");

  blocks.push("CONVERSATION");
  blocks.push(line("Status", data.conversation.status));
  blocks.push(
    line("Created", new Date(data.conversation.createdAt).toLocaleString()),
  );
  blocks.push(
    line(
      "Escalated",
      data.conversation.escalatedAt
        ? new Date(data.conversation.escalatedAt).toLocaleString()
        : null,
    ),
  );
  blocks.push("");

  blocks.push("TRAFFIC");
  blocks.push(line("Referrer", referrer ?? data.traffic?.metadataPagesSample?.[0]));
  blocks.push(line("UTM source", data.traffic?.utmSource));
  if (data.traffic?.metadataPagesSample?.length) {
    blocks.push("Pages seen (metadata sample):");
    for (const u of data.traffic.metadataPagesSample.slice(0, 15)) {
      blocks.push(`  • ${u}`);
    }
  }
  blocks.push("");

  if (data.intentHeuristic) {
    blocks.push("INTENT (AUTOMATIC TAGS)");
    blocks.push(data.intentHeuristic);
    blocks.push("");
  }

  blocks.push("—".repeat(56));
  blocks.push("CHAT TRANSCRIPT (with timestamps)");
  blocks.push("—".repeat(56));
  blocks.push(
    data.transcriptPlainText?.trim() || "(No messages in export.)",
  );
  blocks.push("");

  blocks.push("—".repeat(56));
  blocks.push("TIME ON PAGE (APPROX.)");
  blocks.push("—".repeat(56));
  if (data.pageStaysAggregated?.length) {
    for (const p of data.pageStaysAggregated) {
      const title = p.title ? ` — ${p.title}` : "";
      blocks.push(`• ${p.url}${title} — ${p.approxSeconds}s`);
    }
  } else {
    blocks.push("(No aggregated page dwell.)");
  }
  blocks.push("");

  blocks.push("—".repeat(56));
  blocks.push("PAGE SNAPSHOT TIMELINE");
  blocks.push("—".repeat(56));
  if (data.pageTimeline?.length) {
    for (const row of data.pageTimeline.slice(0, 40)) {
      const t = row.title ? ` — ${row.title}` : "";
      blocks.push(`• ${row.iso} — ${row.pageUrl ?? "(unknown)"}${t}`);
    }
    if (data.pageTimeline.length > 40) {
      blocks.push(`… and ${data.pageTimeline.length - 40} more snapshot(s).`);
    }
  } else {
    blocks.push("(No snapshots.)");
  }
  blocks.push("");

  blocks.push("—".repeat(56));
  blocks.push("LEAD SUMMARY (AI)");
  blocks.push("—".repeat(56));
  if (data.aiLeadSummary?.trim()) {
    blocks.push(stripLightMarkdown(data.aiLeadSummary.trim()));
    if (data.aiLeadSummaryAt) {
      blocks.push("");
      blocks.push(
        `Updated: ${new Date(data.aiLeadSummaryAt).toLocaleString()}`,
      );
    }
  } else {
    blocks.push("(No AI summary for this conversation.)");
  }
  blocks.push("");
  blocks.push("— End of report —");

  return blocks.join("\n");
}
