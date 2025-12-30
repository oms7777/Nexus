// apps/web/app/(dashboard)/me/profile/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

import { useOrganization, useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";

import { MailIcon, UserRoundIcon, Upload, Slack } from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const { organization } = useOrganization();
  const { user } = useUser();
  const searchParams = useSearchParams();

  // Gmail connection (Convex)
  const account = useQuery(api.private.calendar.meConnection, {});

  // User profile (Convex)
  const me = useQuery(api.private.users.meGet, {});
  const setAvatar = useMutation(api.private.users.meSetAvatar);
  const addFile = useAction(api.private.files.addFile);

  // ✅ FIX: listRepsForOrg has args: {}
  const reps = useQuery(
    api.team.listRepsForOrg,
    organization ? {} : ("skip" as any),
  ) as
    | {
        _id: string;
        organizationId: string;
        userId: string;
        role: "sales" | "support";
        regions?: string[];
        available: boolean;
        slackUserId?: string;
        slackDmChannel?: string;
        updatedAt: number;
      }[]
    | undefined;

  const slackInfo = useMemo(() => {
    if (!user || !reps) return null;
    return reps.find((r) => r.userId === user.id) ?? null;
  }, [reps, user]);

  const slackConnected = Boolean(slackInfo?.slackUserId);

  const connectSlackUser = () => {
    window.location.href = "/api/integrations/slack/user/start";
  };

  useEffect(() => {
    const flag = searchParams.get("slack_user_connected");
    if (flag === "1") toast.success("Slack connected successfully");
  }, [searchParams]);

  const [avatarUrl, setAvatarUrl] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  useEffect(() => {
    const m = me as any;
    setAvatarUrl(m?.avatarUrl ?? "");
    setJobTitle(m?.title ?? "");
  }, [me]);

  const connectGmail = () => {
    window.location.href = "/api/integrations/google/start";
  };

  const saveProfile = async () => {
    try {
      await setAvatar({
        avatarUrl: avatarUrl.trim() || undefined,
        title: jobTitle.trim() || undefined,
      });
      toast.success("Profile saved");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save");
    }
  };

  const onSelectFile = async (file?: File) => {
    if (!file) return;
    try {
      const bytes = await file.arrayBuffer();

      const { url } = await addFile({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes,
        category: "avatar",
      });

      setAvatarUrl(url ?? "");
      await setAvatar({
        avatarUrl: url ?? undefined,
        title: jobTitle.trim() || undefined,
      });

      toast.success("Avatar uploaded");
    } catch (e) {
      console.error(e);
      toast.error("Upload failed");
    }
  };

  return (
    <div className="max-w-5xl p-8">
      <h1 className="mb-6 text-2xl md:text-4xl">My Profile</h1>

      {/* ACCOUNT */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserRoundIcon className="h-4 w-4" />
            Your profile image and job title may be shown in on-site nudges and
            booking confirmations.
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-end">
            <div className="space-y-3">
              <div>
                <Label>My avatar (image URL)</Label>
                <Input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://…/me.jpg"
                />
              </div>

              <div>
                <Label>Job title</Label>
                <Input
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Solutions Engineer EMEA"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar preview"
                  className="h-14 w-14 rounded-full border object-cover"
                />
              ) : null}
              <Button onClick={saveProfile}>Save</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <Label htmlFor="avatar-file">Or upload a photo</Label>
              <Input
                id="avatar-file"
                type="file"
                accept="image/*"
                onChange={(e) => onSelectFile(e.target.files?.[0])}
              />
              <p className="text-xs text-muted-foreground">
                JPG/PNG recommended.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById("avatar-file")?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Choose file
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SLACK USER */}
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

            {slackConnected && slackInfo?.slackDmChannel && (
              <p className="text-xs text-muted-foreground">
                DMs will be sent to your Slack account (channel{" "}
                <span className="font-mono">{slackInfo.slackDmChannel}</span>).
              </p>
            )}

            {!slackConnected && (
              <p className="text-xs text-muted-foreground">
                Connect Slack to receive DM notifications when a new meeting is
                booked.
              </p>
            )}
          </div>

          <Button onClick={connectSlackUser}>
            {slackConnected ? "Reconnect Slack" : "Connect Slack"}
          </Button>
        </CardContent>
      </Card>

      {/* GMAIL */}
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
