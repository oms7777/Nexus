// apps/widget/atoms/widget-atoms.ts
import { atom } from "jotai";
import { WidgetScreen } from "../types";
import { atomFamily, atomWithStorage } from "jotai/utils";
import { CONTACT_SESSION_KEY } from "../constants";
import { Doc, Id } from "@workspace/backend/_generated/dataModel";

// Basic widget state atoms
export const screenAtom = atom<WidgetScreen>("loading");
export const organizationIdAtom = atom<string | null>(null);

// Organization-scoped contact session atom
export const contactSessionIdAtomFamily = atomFamily((organizationId: string) => {
  return atomWithStorage<Id<"contactSessions"> | null>(
    `${CONTACT_SESSION_KEY}_${organizationId}`,
    null,
  );
});

// conversationId persistant (scopé org)
export const conversationIdAtomFamily = atomFamily((organizationId: string) => {
  return atomWithStorage<Id<"conversations"> | null>(
    `nexus_conversation_${organizationId}`,
    null,
  );
});

export const errorMessageAtom = atom<string | null>(null);
export const loadingMessageAtom = atom<string | null>(null);

export const widgetSettingsAtom = atom<Doc<"widgetSettings"> | null>(null);
export const vapiSecretsAtom = atom<{ publicApiKey: string } | null>(null);
export const hasVapiSecretsAtom = atom((get) => get(vapiSecretsAtom) !== null);

/**
 * ✅ SAFE wrapper:
 * - tant que organizationId est null → conversationId = null
 * - refuse d’écrire en storage tant que orgId n’est pas défini
 */
export const conversationIdAtom = atom(
  (get) => {
    const orgId = get(organizationIdAtom);
    if (!orgId) return null;
    return get(conversationIdAtomFamily(orgId));
  },
  (get, set, next: Id<"conversations"> | null) => {
    const orgId = get(organizationIdAtom);
    if (!orgId) return; // 🔒 no write on empty orgId
    set(conversationIdAtomFamily(orgId), next);
  },
);
