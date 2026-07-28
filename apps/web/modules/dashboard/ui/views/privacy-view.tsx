"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { ShieldCheckIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { toast } from "sonner";

export function PrivacyView() {
  const settings = useQuery(api.private.privacy.getRetentionSettings, {});
  const setRetention = useMutation(api.private.privacy.setSnapshotRetentionDays);

  const [days, setDays] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) setDays(String(settings.snapshotRetentionDays));
  }, [settings]);

  const handleSave = async () => {
    const parsed = Number(days);
    if (!Number.isFinite(parsed)) {
      toast.error("Enter a number of days");
      return;
    }

    setIsSaving(true);
    try {
      await setRetention({ days: parsed });
      toast.success("Retention updated");
    } catch (e) {
      toast.error(
        (e as { data?: { message?: string } })?.data?.message ?? "Could not update retention",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Privacy & data retention
        </h1>
        <p className="text-sm text-muted-foreground">
          Controls how long visitor data stays in Inboundless.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheckIcon className="size-4 shrink-0" />
            Session replay retention
          </CardTitle>
          <CardDescription>
            Session replay stores a reconstruction of what a visitor saw on your site. Shorter
            retention means less personal data held — pick the shortest window your team can
            actually work with.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {settings === undefined ? (
            <Skeleton className="h-10 w-48" />
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="retention-days">Keep recordings for</Label>
                <div className="flex items-center gap-2">
                  <Input
                    className="w-28"
                    id="retention-days"
                    max={settings.maxDays}
                    min={settings.minDays}
                    onChange={(e) => setDays(e.target.value)}
                    type="number"
                    value={days}
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                  <Button
                    className="ml-2"
                    disabled={isSaving || days === String(settings.snapshotRetentionDays)}
                    onClick={handleSave}
                    type="button"
                  >
                    {isSaving ? "Saving…" : "Save"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Between {settings.minDays} and {settings.maxDays} days. Default is{" "}
                  {settings.defaultDays}. Recordings past this age are deleted automatically, and
                  lowering the value also shortens the deadline on recordings already stored.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Right to erasure</CardTitle>
          <CardDescription>
            When a visitor asks to be deleted, open their conversation in the inbox and use
            &ldquo;Erase visitor data&rdquo; in the contact panel. That removes their recordings and
            analytics events, and anonymizes their contact details. The conversation itself is kept
            without identity so your reporting stays accurate.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
