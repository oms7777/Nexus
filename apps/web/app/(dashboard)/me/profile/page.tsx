// apps/web/app/(dashboard)/me/profile/page.tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { MailIcon } from "lucide-react";

export default function ProfilePage() {
  const account = useQuery(api.private.calendar.meConnection, {}); // doc tokens (Calendar + Gmail send)

  const connectGmail = () => { window.location.href = "/api/google-oauth/start"; };

  return (
    <div className="p-8 max-w-screen-lg">
      <h1 className="mb-6 text-2xl md:text-4xl">My Profile</h1>

      <Card className="mb-6">
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent>
          {/* Ton bloc "Manage with Clerk" existant ici */}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MailIcon className="size-5" /> Gmail</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between">
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
