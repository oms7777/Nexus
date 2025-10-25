// apps/web/app/(dashboard)/me/profile/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { MailIcon, UserRoundIcon } from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const account = useQuery(api.private.calendar.meConnection, {});
  const me = useQuery(api.private.users.meGet, {});              // ✅
  const setAvatar = useMutation(api.private.users.meSetAvatar);  // ✅

  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    setAvatarUrl(((me as any)?.avatarUrl as string) ?? "");
  }, [me]);

  const connectGmail = () => { window.location.href = "/api/google-oauth/start"; };

  const save = async () => {
    try {
      await setAvatar({ avatarUrl: avatarUrl.trim() || undefined });
      toast.success("Profile saved");
    } catch {
      toast.error("Failed to save");
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="mb-6 text-2xl md:text-4xl">My Profile</h1>

      <Card className="mb-6">
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserRoundIcon className="h-4 w-4" />
            <span>Your profile image may be shown in the on-site promo/nudge.</span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <Label>My avatar (image URL)</Label>
              <Input
                placeholder="https://…/me.jpg"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              {avatarUrl?.trim() ? (
                <img src={avatarUrl} alt="preview" className="h-14 w-14 rounded-full border object-cover" />
              ) : null}
              <Button onClick={save}>Save</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MailIcon className="size-5" /> Gmail</CardTitle></CardHeader>
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
