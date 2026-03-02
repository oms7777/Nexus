"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

import { Switch } from "@workspace/ui/components/switch";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { toast } from "sonner";

import { CardShell, BrandPill } from "@/modules/analytics/shared/analytics-primitives";

export default function NotificationsPage() {
  const prefs = useQuery(api.private.notifications.meNotificationPrefs, {});
  const savePrefs = useMutation(api.private.notifications.saveMeNotificationPrefs);

  const [showBadges, setShowBadges] = useState(true);
  const [playSound, setPlaySound] = useState(true);
  const [autoOpenConversation, setAutoOpenConversation] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!prefs) return;
    setShowBadges(prefs.showBadges ?? true);
    setPlaySound(prefs.playSound ?? true);
    setAutoOpenConversation(prefs.autoOpenConversation ?? false);
  }, [prefs]);

  const onSave = async () => {
    try {
      setSaving(true);
      await savePrefs({ showBadges, playSound, autoOpenConversation });
      toast.success("Preferences saved");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Control how the dashboard behaves when new conversations are assigned to you.
        </p>
      </div>

      <CardShell
        title="In-app behaviour"
        subtitle="Sidebar badges, sounds, and auto-navigation"
        right={<BrandPill>Profile</BrandPill>}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Show badges</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Display the escalated count badge next to Conversations in the sidebar.
              </p>
            </div>
            <Switch checked={showBadges} onCheckedChange={(v) => setShowBadges(Boolean(v))} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Play sound</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Play a short beep when new conversations are assigned to you.
              </p>
            </div>
            <Switch checked={playSound} onCheckedChange={(v) => setPlaySound(Boolean(v))} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Auto-open conversation</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Automatically navigate to the conversation when a new lead is routed to you.
              </p>
            </div>
            <Switch
              checked={autoOpenConversation}
              onCheckedChange={(v) => setAutoOpenConversation(Boolean(v))}
            />
          </div>

          <Button onClick={onSave} disabled={saving} className="mt-2">
            {saving ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </CardShell>
    </div>
  );
}
