import { atom } from "jotai";
import type { Doc } from "@workspace/backend/_generated/dataModel";

export const promoAtom = atom<Doc<"promos"> | null>(null);
