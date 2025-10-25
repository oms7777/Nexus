// apps/web/app/(dashboard)/me/profile/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { MailIcon, UserRoundIcon, Upload } from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const account = useQuery(api.private.calendar.meConnection, {});
  const me = useQuery(api.private.users.meGet, {});
  const setAvatar = useMutation(api.private.users.meSetAvatar);
  const addFile = useAction(api.private.files.addFile);

  const [avatarUrl, setAvatarUrl] = useState<string>("");

  useEffect(() => {
    // me?.avatarUrl can be string | undefined | null depending on your data; normalize to ""
    const url = (me as any)?.avatarUrl as string | null | undefined;
    setAvatarUrl(url ?? "");
  }, [me]);

  const connectGmail = () => { window.location.href = "/api/google-oauth/start"; };

  const saveUrl = async () => {
    try {
      await setAvatar({ avatarUrl: avatarUrl.trim() || undefined }); // undefined, not null
      toast.success("Profile saved");
    } catch {
      toast.error("Failed to save");
    }
  };

  const onSelectFile = async (file?: File) => {
    if (!file) return;
    try {
      // ➜ Expect ArrayBuffer (NOT Uint8Array)
      const bytes: ArrayBuffer = await file.arrayBuffer();

      const { url } = await addFile({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes,
        category: "avatar",
      });

      // url is string | null in your action => coerce to string/undefined
      const normalized = url ?? "";
      setAvatarUrl(normalized);
      await setAvatar({ avatarUrl: url ?? undefined });

      toast.success("Avatar uploaded");
    } catch {
      toast.error("Upload failed");
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="mb-6 text-2xl md:text-4xl">My Profile</h1>

      <Card className="mb-6">
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserRoundIcon className="h-4 w-4" />
            <span>Your profile image may be shown in the on-site promo/nudge.</span>
          </div>

          {/* Set by URL */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <Label htmlFor="avatar-url">My avatar (image URL)</Label>
              <Input
                id="avatar-url"
                placeholder="https://…/me.jpg"
                value={avatarUrl}                              
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              {avatarUrl.trim() ? (
                <img
                  src={avatarUrl}
                  alt="preview"
                  className="h-14 w-14 rounded-full border object-cover"
                />
              ) : null}
              <Button onClick={saveUrl}>Save</Button>
            </div>
          </div>

          {/* Or upload */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="avatar-file">Or upload a photo</Label>
              <Input
                id="avatar-file"
                type="file"
                accept="image/*"
                onChange={(e) => void onSelectFile(e.target.files?.[0])}
              />
              <p className="text-xs text-muted-foreground">
                JPG/PNG recommended. We’ll host it and use the URL in your profile.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById("avatar-file")?.click()}
              className="justify-self-start md:justify-self-end"
            >
              <Upload className="mr-2 h-4 w-4" />
              Choose file
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailIcon className="size-5" /> Gmail
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {account ? <>Connected as <span className="font-medium">{account.email ?? "your account"}</span></>
                     : <>Connect Gmail to send confirmations from your mailbox (optional).</>}
          </div>
          <Button onClick={connectGmail}>{account ? "Reconnect" : "Connect Gmail"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
