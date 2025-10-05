// apps/widget/modules/widget/atoms/qualify-atoms.ts
"use client";
import { atom } from "jotai";

export type QualifyStep =
  | "idle"
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
  // keep region if you still use it elsewhere:
  region?: "EMEA" | "NA" | "LATAM" | "APAC";
};

export const qualifyStepAtom = atom<QualifyStep>("idle");
export const qualifyDataAtom = atom<QualifyData>({});
