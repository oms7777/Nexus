"use client";
import { atom } from "jotai";

export type QualifyStep =
  | "idle"
  | "consent"
  | "ask_name"
  | "ask_email"
  | "ask_company"
  | "ask_role"
  | "pick_rep" // 👈 choix du sales
  | "picking"
  | "done";

export type QualifyData = {
  name?: string;
  email?: string;
  company?: string;
  role?: string;
  region?: "EMEA" | "NA" | "LATAM" | "APAC";
};

export const qualifyStepAtom = atom<QualifyStep>("idle");
export const qualifyDataAtom = atom<QualifyData>({});

// ✅ inclut "chat"
export type BookingIntent = "none" | "chat" | "book";
export const bookingIntentAtom = atom<BookingIntent>("none");

export const consentGivenAtom = atom<boolean>(false);

/**
 * Représentant sélectionné (sales rep) – optionnel
 * Utile si tu veux afficher le rep choisi ailleurs dans le widget.
 */
export type AssignedRep = {
  userId: string;
  name?: string;
  avatarUrl?: string;
  regions: string[];
};

export const assignedRepAtom = atom<AssignedRep | null>(null);
