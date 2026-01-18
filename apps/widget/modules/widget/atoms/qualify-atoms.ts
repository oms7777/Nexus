// apps/widget/modules/widget/atoms/qualify-atoms.ts
"use client";

import { atomWithStorage } from "jotai/utils";

export type QualifyStep =
  | "idle"
  | "consent"
  | "ask_name"
  | "ask_email"
  | "ask_company"
  | "ask_role"
  | "pick_rep"
  | "auto_assign_wait" // ✅ NEW
  | "picking"
  | "done";

export type QualifyData = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;

  // ✅ qualification description / use case
  description?: string;

  region?: "EMEA" | "NA" | "LATAM" | "APAC";
};

export const qualifyStepAtom = atomWithStorage<QualifyStep>(
  "nexus:qualifyStep",
  "idle"
);

export const qualifyDataAtom = atomWithStorage<QualifyData>(
  "nexus:qualifyData",
  {}
);

export type BookingIntent = "none" | "chat" | "book";
export const bookingIntentAtom = atomWithStorage<BookingIntent>(
  "nexus:bookingIntent",
  "none"
);

export const consentGivenAtom = atomWithStorage<boolean>(
  "nexus:consentGiven",
  false
);

export type AssignedRep = {
  userId: string;
  name?: string;
  avatarUrl?: string;
  regions: string[];
};

export const assignedRepAtom = atomWithStorage<AssignedRep | null>(
  "nexus:assignedRep",
  null
);
