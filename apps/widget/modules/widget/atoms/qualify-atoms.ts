"use client";
import { atom } from "jotai";

export type QualifyStep =
  | "idle"
  | "consent"   // ← NOUVEAU: étape de consentement
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
  // (facultatif) si tu l'utilises ailleurs:
  region?: "EMEA" | "NA" | "LATAM" | "APAC";
};

// État du flow de qualif
export const qualifyStepAtom = atom<QualifyStep>("idle");
export const qualifyDataAtom = atom<QualifyData>({});

// Déclencheur d’intention "book a demo" (depuis SmartPromo)
export const bookingIntentAtom = atom<"none" | "book">("none");

// Consentement RGPD donné ?
export const consentGivenAtom = atom<boolean>(false);
