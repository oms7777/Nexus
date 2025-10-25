// apps/web/app/(dashboard)/me/profile/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { MailIcon, UserRoundIcon } from "lucide-react";
import { Separator } from "@workspace/ui/components/separator";
import { toast } from "sonner";

export default function ProfilePage() {
  const account = useQuery(api.private.calendar.meConnection, {});
  const ws = useQuery(api.private.widgetSettings.getOne); // <- déjà utilisé ailleurs chez toi

  const upsertWs = useMutation(api.private.widgetSettings.upsert as any); // remplace le nom si besoin
  const connectGmail = () => { window.location.href = "/api/google-oauth/start"; };

  // local state pour 3 avatars
  const [avatars, setAvatars] = useState<string[]>(["", "", ""]);

  useEffect(() => {
    const initial = (ws as any)?.teamAvatars as string[] | undefined;
    if (initial && initial.length) {
      const next = [...initial].slice(0, 3);
      while (next.length < 3) next.push("");
      setAvatars(next);
    }
  }, [ws]);

  const previews = useMemo(
    () => avatars.map((u) => (u?.trim() ? u.trim() : "")),
    [avatars]
  );

  async function saveAvatars() {
    const clean = avatars.map((s) => s.trim()).filter(Boolean);
    try {
      await upsertWs({
        // conserve les autres champs si ton mutation exige un upsert complet
        ...(ws ?? {}),
        teamAvatars: clean.slice(0, 3),
      } as any);
      toast.success("Promo avatars saved");
    } catch {
      toast.error("Failed to save avatars");
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="mb-6 text-2xl md:text-4xl">My Profile</h1>

      <Card className="mb-6">
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {/* Ton bloc "Manage with Clerk" existant ici */}
          <div className="flex items-center gap-2">
            <UserRoundIcon className="h-4 w-4" />
            <span>
              Your profile image may be used in chat widgets, emails, and client-facing promos.
              You can also set a small team stack below.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Promo Avatars (up to 3)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Paste image URLs for the small avatar stack shown in the on-site promo (like SUSE).
            First 3 are used. Leave empty to fallback to your brand logo.
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {avatars.map((value, idx) => (
              <div key={idx} className="space-y-2">
                <Label>Avatar {idx + 1}</Label>
                <Input
                  placeholder="https://…/photo.jpg"
                  value={value}
                  onChange={(e) => {
                    const next = [...avatars];
                    next[idx] = e.target.value;
                    setAvatars(next);
                  }}
                />
                {previews[idx] && (
                  <img
                    src={previews[idx]}
                    alt={`avatar-${idx + 1}`}
                    className="h-16 w-16 rounded-full border object-cover"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button onClick={saveAvatars}>Save avatars</Button>
          </div>

          <Separator />

          <p className="text-xs text-muted-foreground">
            Tip: you can host images on your CDN, Google Drive (public link), or your own file storage.
          </p>
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
            {account ? (
              <>Connected as <span className="font-medium">{account.email ?? "your account"}</span></>
            ) : (
              <>Connect Gmail to send confirmations from your mailbox (optional). Booking emails are sent to your address even without this.</>
            )}
          </div>
          <Button onClick={connectGmail}>{account ? "Reconnect" : "Connect Gmail"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
