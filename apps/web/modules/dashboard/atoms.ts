import { atomWithStorage } from "jotai/utils"
import { Doc } from "@workspace/backend/_generated/dataModel"

import { STATUS_FILTER_KEY } from "./constants"

export const statusFilterAtom = atomWithStorage<
    Doc<"conversations">["status"] | "all" | "active"
>(STATUS_FILTER_KEY, "active")

