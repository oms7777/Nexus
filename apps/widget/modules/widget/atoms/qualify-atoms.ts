"use client";
import { atom } from "jotai";

export type QualifyStep =
  | "idle"
  | "consent"
  | "ask_name"
  | "ask_email"
  | "ask_company"
  | "ask_role"
  | "picking"
  | "done";

export type QualifyData = {
  name?: string;
  email?: string;
  company?: string;
  role?: string;
  region?: "EMEA" | "NA" | "LATAM" | "APAC";
};

// État du flow de qualif
export const qualifyStepAtom = atom<QualifyStep>("idle");
export const qualifyDataAtom = atom<QualifyData>({});

// ✅ L’intention inclut maintenant "chat"
export type BookingIntent = "none" | "chat" | "book";
export const bookingIntentAtom = atom<BookingIntent>("none");

// Consentement RGPD donné ?
export const consentGivenAtom = atom<boolean>(false);
