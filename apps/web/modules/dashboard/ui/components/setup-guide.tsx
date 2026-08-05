"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { useOrgCapabilities } from "@/modules/auth/hooks/use-org-capabilities";
import { SetupChecklist } from "./setup-checklist";

const DISMISS_KEY = "inboundless_setup_dismissed_session";

function wasDismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function markDismissedThisSession() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // ignore
  }
}

/**
 * Admin-only onboarding. Modal auto-opens while setup is incomplete (once per
 * browser session). A slim banner stays on Live Map until everything is done,
 * including if something disconnects later.
 */
export function SetupGuide() {
  const { isLoaded, isAdmin } = useOrgCapabilities();
  const data = useQuery(api.private.onboarding.getStatus, isAdmin ? {} : "skip");
  const [open, setOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isAdmin || !data || data.isComplete || autoOpened) return;
    if (wasDismissedThisSession()) {
      setAutoOpened(true);
      return;
    }
    setOpen(true);
    setAutoOpened(true);
  }, [isLoaded, isAdmin, data, autoOpened]);

  if (!isLoaded || !isAdmin || data === undefined) return null;
  if (data.isComplete) return null;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) markDismissedThisSession();
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-amber-200/80 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="min-w-0">
          <span className="font-medium">Setup incomplete</span>
          <span className="text-amber-800/80 dark:text-amber-200/80">
            {" "}
            · {data.completed}/{data.total} steps — finish these to start capturing leads
          </span>
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 border-amber-300 bg-white hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:hover:bg-amber-900"
          onClick={() => setOpen(true)}
        >
          Continue setup
        </Button>
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto p-0 sm:max-w-lg">
          <DialogHeader className="space-y-1 px-5 pt-5">
            <DialogTitle>Finish setting up Inboundless</DialogTitle>
            <DialogDescription>
              {data.completed} of {data.total} steps done. This closes for good once everything
              is connected.
            </DialogDescription>
          </DialogHeader>

          {data.status === "paused" ? (
            <div className="mx-5 rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
              This workspace is paused, so the assistant will not reply to visitors.
            </div>
          ) : null}

          <div className="px-2 pb-4">
            <SetupChecklist
              steps={data.steps}
              completed={data.completed}
              total={data.total}
              compact
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
