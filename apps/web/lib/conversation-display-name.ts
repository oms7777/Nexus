/**
 * Human-readable title for a conversation in the inbox and contact header.
 * Avoids generic "Visitor" and does not append random id suffixes for anonymous users.
 */
export function getConversationDisplayName(conversation: {
  _id?: string;
  contactSession?: {
    _id?: string;
    name?: string;
    email?: string;
    /** Accepts full Convex session metadata; company/role read when present. */
    metadata?: unknown;
  };
}): string {
  const cs = conversation?.contactSession ?? {};
  const meta = cs.metadata as Record<string, unknown> | undefined;
  const name = typeof cs?.name === "string" ? cs.name.trim() : "";
  const email = typeof cs?.email === "string" ? cs.email.trim() : "";
  const company =
    typeof meta?.company === "string" ? meta.company.trim() : "";
  const role = typeof meta?.role === "string" ? meta.role.trim() : "";

  if (name && name.toLowerCase() !== "visitor") return name;
  if (email) return email;
  if (company) return role ? `${company} • ${role}` : company;
  return "New visitor";
}
