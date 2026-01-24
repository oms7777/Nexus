import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { Id } from "@workspace/backend/_generated/dataModel";
import { WidgetScreen } from "../types";

/* ---------------- basic widget state ---------------- */

export const screenAtom = atom<WidgetScreen>("loading");
export const organizationIdAtom = atom<string | null>(null);

export const errorMessageAtom = atom<string | null>(null);
export const loadingMessageAtom = atom<string | null>(null);

/* ---------------- contact session (GLOBAL) ---------------- */

/**
 * ✅ One session per browser
 * No org-scoped family anymore
 */
export const contactSessionIdAtom = atomWithStorage<
  Id<"contactSessions"> | null
>("nx_contact_session", null);

/* ---------------- conversation (GLOBAL) ---------------- */

/**
 * ✅ One conversation per browser session
 */
export const conversationIdAtom = atomWithStorage<
  Id<"conversations"> | null
>("nx_conversation_id", null);

/* ---------------- widget settings + voice ---------------- */

export const widgetSettingsAtom = atom<any>(null);

export const vapiSecretsAtom = atom<{ publicApiKey: string } | null>(null);

export const hasVapiSecretsAtom = atom(
  (get) => get(vapiSecretsAtom) !== null
);