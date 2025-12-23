"use client";

import { atom } from "jotai";
import { atomFamily, atomWithStorage } from "jotai/utils";

export type QualifyStep =
  | "idle"
  | "consent"
  | "ask_name"
  | "ask_email"
  | "ask_company"
  | "ask_role"
  | "pick_rep"
  | "picking"
  | "done";

export type QualifyData = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  region?: "EMEA" | "NA" | "LATAM" | "APAC";
};

export type BookingIntent = "none" | "chat" | "book";

export type AssignedRep = {
  userId: string;
  name?: string;
  avatarUrl?: string;
  regions: string[];
};

const key = (orgId: string, k: string) => `nexus:${orgId}:${k}`;

// ⚠️ orgId = "" => fallback safe (évite crash), mais idéalement passe toujours orgId réel.
export const qualifyStepAtomFamily = atomFamily((orgId: string) =>
  atomWithStorage<QualifyStep>(key(orgId || "unknown", "qualifyStep"), "idle")
);

export const qualifyDataAtomFamily = atomFamily((orgId: string) =>
  atomWithStorage<QualifyData>(key(orgId || "unknown", "qualifyData"), {})
);

export const bookingIntentAtomFamily = atomFamily((orgId: string) =>
  atomWithStorage<BookingIntent>(key(orgId || "unknown", "bookingIntent"), "none")
);

export const consentGivenAtomFamily = atomFamily((orgId: string) =>
  atomWithStorage<boolean>(key(orgId || "unknown", "consentGiven"), false)
);

export const assignedRepAtomFamily = atomFamily((orgId: string) =>
  atomWithStorage<AssignedRep | null>(key(orgId || "unknown", "assignedRep"), null)
);

// Optionnel : atoms "global" non persistés si tu en as besoin
export const qualifyDebugAtom = atom(false);
