// apps/widget/atoms/widget-atoms.ts
import { atom } from "jotai";
import { WidgetScreen } from "../types";
import { atomFamily, atomWithStorage } from "jotai/utils";
import { CONTACT_SESSION_KEY } from "../constants";
import { Doc, Id } from "@workspace/backend/_generated/dataModel";

/* ---------------- basic widget state ---------------- */

export const screenAtom = atom<WidgetScreen>("loading");
export const organizationIdAtom = atom<string | null>(null);

export const errorMessageAtom = atom<string | null>(null);
export const loadingMessageAtom = atom<string | null>(null);

export const widgetSettingsAtom = atom<Doc<"widgetSettings"> | null>(null);
export const vapiSecretsAtom = atom<{ publicApiKey: string } | null>(null);
export const hasVapiSecretsAtom = atom((get) => get(vapiSecretsAtom) !== null);

/* ---------------- contact session (scoped by org) ---------------- */

export const contactSessionIdAtomFamily = atomFamily((organizationId: string) => {
  return atomWithStorage<Id<"contactSessions"> | null>(
    `${CONTACT_SESSION_KEY}_${organizationId}`,
    null
  );
});

/* ---------------- conversation (scoped by org + session) ---------------- */

/**
 * ✅ NEW: conversation storage key depends on BOTH orgId + sessionId
 * This prevents “old conversationId with new sessionId” mismatches.
 */
const conversationIdAtomFamily = atomFamily(
  (key: { organizationId: string; contactSessionId: string }) => {
    return atomWithStorage<Id<"conversations"> | null>(
      `nexus_conversation_${key.organizationId}_${key.contactSessionId}`,
      null
    );
  }
);

/**
 * ✅ SAFE wrapper:
 * - if orgId or sessionId missing => conversationId is null
 * - no writes until both exist
 */
export const conversationIdAtom = atom(
  (get) => {
    const orgId = get(organizationIdAtom);
    if (!orgId) return null;

    const sessionId = get(contactSessionIdAtomFamily(orgId));
    if (!sessionId) return null;

    return get(conversationIdAtomFamily({ organizationId: orgId, contactSessionId: sessionId }));
  },
  (get, set, next: Id<"conversations"> | null) => {
    const orgId = get(organizationIdAtom);
    if (!orgId) return;

    const sessionId = get(contactSessionIdAtomFamily(orgId));
    if (!sessionId) return;

    set(conversationIdAtomFamily({ organizationId: orgId, contactSessionId: sessionId }), next);
  }
);
