"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useOrganization, useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { MailIcon, UserRoundIcon, Upload, Slack } from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const { organization } = useOrganization();
  const { user, isLoaded: userLoaded } = useUser();
  const searchParams = useSearchParams();

  const account = useQuery(api.private.calendar.meConnection, {});
  const me = useQuery(api.private.users.meGet, {});
  const setMe = useMutation(api.private.users.meSetAvatar);

  const ensurePresence = useMutation(api.team.ensureRepPresenceForMe);

  const reps = useQuery(
    api.team.listRepsForOrg,
    organization ? {} : ("skip" as any),
  ) as any[] | undefined;

  useEffect(() => {
    if (!organization || !user) return;
    ensurePresence({ role: "sales", available: true }).catch(() => {});
  }, [organization, user, ensurePresence]);

  const slackInfo = useMemo(() => {
    if (!user || !reps) return null;
    return reps.find((r) => r.userId === user.id) ?? null;
  }, [reps, user]);

  const slackConnected = Boolean(slackInfo?.slackUserId);

  useEffect(() => {
    const flag = searchParams.get("slack_user_connected");
    if (flag === "1") toast.success("Slack connected successfully");
  }, [searchParams]);

  const [jobTitle, setJobTitle] = useState("");
  const [saving, setSaving] = useState(false);

  // ✅ Display: Clerk first, then Convex fallback
  const displayAvatar =
    (userLoaded ? user?.imageUrl : undefined) || (me as any)?.avatarUrl || "";

  useEffect(() => {
    const m = me as any;
    setJobTitle(m?.title ?? "");
  }, [me]);

  const connectSlackUser = () => {
    window.location.href = "/api/integrations/slack/user/start";
  };

  const connectGmail = () => {
    window.location.href = "/api/integrations/google/start";
  };

  // ✅ Always sync name + avatar from Clerk when saving (so Convex is reliable for widget/header)
  const syncClerkToConvex = async () => {
    if (!user) return;
    await user.reload(); // ✅ ensure imageUrl updated
    const fullName =
      user.fullName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      "Rep";

    await setMe({
      name: fullName,
      avatarUrl: user.imageUrl || undefined,
      title: jobTitle.trim() || undefined,
    });
  };

  const saveProfile = async () => {
    try {
      setSaving(true);
      await syncClerkToConvex();
      toast.success("Profile saved");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const onSelectFile = async (file?: File) => {
    if (!file) return;

    try {
      setSaving(true);
      if (!user) throw new Error("User not loaded");

      await user.setProfileImage({ file });
      await user.reload(); // ✅ critical

      await syncClerkToConvex();
      toast.success("Avatar updated");
    } catch (e) {
      console.error(e);
      toast.error("Upload failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl p-8">
      <h1 className="mb-6 text-2xl md:text-4xl">My Profile</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserRoundIcon className="h-4 w-4" />
            Your profile image and job title may be shown in on-site nudges and booking confirmations.
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-end">
            <div className="space-y-3">
              <div>
                <Label>Job title</Label>
                <Input
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Sales"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              {displayAvatar ? (
                <img
                  src={displayAvatar}
                  alt="Avatar preview"
                  className="h-14 w-14 rounded-full border object-cover"
                />
              ) : null}

              <Button onClick={saveProfile} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <Label htmlFor="avatar-file">Upload a photo</Label>
              <Input
                id="avatar-file"
                type="file"
                accept="image/*"
                onChange={(e) => onSelectFile(e.target.files?.[0])}
              />
              <p className="text-xs text-muted-foreground">JPG/PNG recommended.</p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById("avatar-file")?.click()}
              disabled={saving}
            >
              <Upload className="mr-2 h-4 w-4" />
              Choose file
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Slack className="size-5 text-blue-500" />
            Slack Notifications
          </CardTitle>
        </CardHeader>

        <CardContent className="flex items-center justify-between gap-4">
          <div className="space-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              {slackConnected ? (
                <Badge className="bg-green-600">Connected</Badge>
              ) : (
                <Badge variant="outline">Not Connected</Badge>
              )}
            </div>
            {!slackConnected && (
              <p className="text-xs text-muted-foreground">
                Connect Slack to receive DM notifications when a new meeting is booked.
              </p>
            )}
          </div>

          <Button onClick={connectSlackUser}>
            {slackConnected ? "Reconnect Slack" : "Connect Slack"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailIcon className="size-5" />
            Gmail
          </CardTitle>
        </CardHeader>

        <CardContent className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {account ? (
              <>
                Connected as <span className="font-medium">{account.email}</span>
              </>
            ) : (
              <>Connect Gmail to send confirmations.</>
            )}
          </div>

          <Button onClick={connectGmail}>
            {account ? "Reconnect Gmail" : "Connect Gmail"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
