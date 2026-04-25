"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

import { Switch } from "@workspace/ui/components/switch";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { toast } from "sonner";

import { CardShell, BrandPill } from "@/modules/analytics/shared/analytics-primitives";
import { useOrganization } from "@clerk/nextjs";
import { LiveVisitorStreamCard } from "@/modules/live/components/LiveVisitorStreamCard";
import { useRouter } from "next/navigation";

export default function NotificationsPage() {
  const prefs = useQuery(api.private.notifications.meNotificationPrefs, {});
  const savePrefs = useMutation(api.private.notifications.saveMeNotificationPrefs);
  const escalations = useQuery(api.private.notifications.listUnseenEscalationsForMe, {});
  const { organization } = useOrganization();
  const orgId = organization?.id || "";
  const router = useRouter();

  const [showBadges, setShowBadges] = useState(true);
  const [playSound, setPlaySound] = useState(true);
  const [autoOpenConversation, setAutoOpenConversation] = useState(false); // kept for now (stored), but not used
  const [saving, setSaving] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);

  useEffect(() => {
    if (!prefs) return;
    setShowBadges(prefs.showBadges ?? true);
    setPlaySound(prefs.playSound ?? true);
    setAutoOpenConversation(prefs.autoOpenConversation ?? false);
  }, [prefs]);

  const visitors = useMemo(() => {
    const list = Array.isArray(escalations) ? escalations : [];
    return list.map((e) => ({
      _id: String(e.conversationId),
      name: e.visitor.name,
      email: e.visitor.email,
      city: e.visitor.city,
      countryCode: e.visitor.countryCode,
      currentUrl: e.visitor.currentUrl,
      title: e.visitor.title,
      pageUrls: e.visitor.pageUrls,
      pageCount: e.visitor.pageCount,
      timeOnSiteMs: e.visitor.timeOnSiteMs,
      contactSessionId: String(e.contactSessionId),
      conversationId: String(e.conversationId),
      userAgent: e.visitor.userAgent,
    }));
  }, [escalations]);

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
          Escalated visitors assigned to you. Click a card to open the conversation.
        </p>
      </div>

      <CardShell
        title="Escalations"
        subtitle="Unseen escalated conversations routed to you"
        right={<BrandPill>Inbox</BrandPill>}
      >
        <div className="space-y-4">
          {visitors.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              No escalations right now.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {visitors.map((v) => (
                <LiveVisitorStreamCard
                  key={v._id}
                  visitor={v as any}
                  orgId={orgId}
                  isSelected={selectedConvId === v._id}
                  onSelect={() => setSelectedConvId(v._id)}
                  mode="open_conversation"
                  onOpenConversation={() => router.push(`/conversations/${v.conversationId}`)}
                />
              ))}
            </div>
          )}
        </div>
      </CardShell>

      <CardShell
        title="Preferences"
        subtitle="Sidebar badge and sound"
        right={<BrandPill>Profile</BrandPill>}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Show badges</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Display the escalated count badge next to Notifications in the sidebar.
              </p>
            </div>
            <Switch checked={showBadges} onCheckedChange={(v) => setShowBadges(Boolean(v))} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Play sound</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Play a short beep when new escalations are assigned to you.
              </p>
            </div>
            <Switch checked={playSound} onCheckedChange={(v) => setPlaySound(Boolean(v))} />
          </div>

          <Button onClick={onSave} disabled={saving} className="mt-2">
            {saving ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </CardShell>
    </div>
  );
}
