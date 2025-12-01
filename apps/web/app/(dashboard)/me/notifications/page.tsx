"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card";
import { Switch } from "@workspace/ui/components/switch";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { toast } from "sonner";

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
      await savePrefs({
        showBadges,
        playSound,
        autoOpenConversation,
      });
      toast.success("Notification preferences saved");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="mb-6 text-2xl md:text-4xl">Notifications</h1>

      <Card>
        <CardHeader>
          <CardTitle>In-app behaviour</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Control how Nexus behaves when new leads or conversations arrive.
          </p>

          <Separator />

          {/* Show badges */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Show badges for new activity</Label>
              <p className="text-xs text-muted-foreground">
                Display counters and red dots in the sidebar and conversation list
                when there are unread messages.
              </p>
            </div>
            <Switch
              checked={showBadges}
              onCheckedChange={(v) => setShowBadges(Boolean(v))}
            />
          </div>

          {/* Play sound */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Play a sound for new leads</Label>
              <p className="text-xs text-muted-foreground">
                When a new lead is assigned to you, Nexus can play a short sound
                while you&apos;re in the dashboard.
              </p>
            </div>
            <Switch
              checked={playSound}
              onCheckedChange={(v) => setPlaySound(Boolean(v))}
            />
          </div>

          {/* Auto-open conversation */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Auto-open assigned conversations</Label>
              <p className="text-xs text-muted-foreground">
                Automatically open the conversation page when a new lead is routed
                to you.
              </p>
            </div>
            <Switch
              checked={autoOpenConversation}
              onCheckedChange={(v) => setAutoOpenConversation(Boolean(v))}
            />
          </div>

          <div className="pt-2">
            <Button onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save preferences"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
