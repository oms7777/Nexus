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
    null
  );
});

// ✅ NEW: conversationId persistant (scopé org)
export const conversationIdAtomFamily = atomFamily((organizationId: string) => {
  return atomWithStorage<Id<"conversations"> | null>(
    `nexus_conversation_${organizationId}`,
    null
  );
});

export const errorMessageAtom = atom<string | null>(null);
export const loadingMessageAtom = atom<string | null>(null);

// ⚠️ si tu utilises encore conversationIdAtom ailleurs, remplace-le par le family
// export const conversationIdAtom = atom<Id<"conversations"> | null>(null);

export const widgetSettingsAtom = atom<Doc<"widgetSettings"> | null>(null);
export const vapiSecretsAtom = atom<{ publicApiKey: string } | null>(null);
export const hasVapiSecretsAtom = atom((get) => get(vapiSecretsAtom) !== null);
