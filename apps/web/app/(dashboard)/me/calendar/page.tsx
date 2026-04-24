// apps/web/app/(dashboard)/me/calendar/page.tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Doc } from "@workspace/backend/_generated/dataModel";
import { toast } from "sonner";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";

const DAYS = [
  { label: "Monday", day: 1 },
  { label: "Tuesday", day: 2 },
  { label: "Wednesday", day: 3 },
  { label: "Thursday", day: 4 },
  { label: "Friday", day: 5 },
];

const TIMES = [
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
];

export default function Page() {
  const account = useQuery(api.private.calendar.meConnection, {});
  const settings = useQuery(api.private.calendar.mySettings, {});
  const saveSettings = useMutation(api.private.calendar.saveMySettings);

  // 🔹 nouveaux bookings
  const bookings = useQuery(api.private.booking.listMine, { limit: 50 });

  const [meetingLinkType, setMeetingLinkType] = useState<
    "google_meet" | "teams" | "manual"
  >("google_meet");
  const [manualUrl, setManualUrl] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [bufferMin, setBufferMin] = useState(0);
  const [weekly, setWeekly] = useState<{ day: number; start: string; end: string }[]>(
    DAYS.map((d) => ({ day: d.day, start: "09:00", end: "17:00" }))
  );

  useEffect(() => {
    if (settings) {
      const savedType = (settings.meetingLinkType as any) ?? "google_meet";
      setMeetingLinkType(savedType);
      setManualUrl(settings.manualUrl ?? "");
      setDurationMin(settings.durationMin ?? 30);
      setBufferMin(settings.bufferMin ?? 0);
      setWeekly(settings.weekly ?? weekly);

      // If the saved preference is incompatible with the currently connected calendar,
      // fall back to the provider default (unless it's manual, which is always allowed).
      if (account?.provider === "google" && savedType === "teams") {
        setMeetingLinkType("google_meet");
      }
      if (account?.provider === "microsoft" && savedType === "google_meet") {
        setMeetingLinkType("teams");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?._id, account?.provider]);

  useEffect(() => {
    if (!account) return;
    if (account.provider === "google" && meetingLinkType === "teams") {
      setMeetingLinkType("google_meet");
    }
    if (account.provider === "microsoft" && meetingLinkType === "google_meet") {
      setMeetingLinkType("teams");
    }
  }, [account?.provider, meetingLinkType]);

  useEffect(() => {
    if (settings) return;
    if (!account) return;
    setMeetingLinkType((prev) => {
      if (prev !== "manual") {
        return account.provider === "microsoft" ? "teams" : "google_meet";
      }
      return prev;
    });
  }, [account?.provider, settings]);

  const onConnectGoogle = () => {
    window.location.href = "/api/integrations/google/start";
  };
  const onConnectMicrosoft = () => {
    window.location.href = "/api/integrations/microsoft/start";
  };

  const disconnect = useMutation(api.private.calendar.disconnect);
  const onDisconnect = async () => {
    try {
      await disconnect({});
      toast.success("Disconnected");
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  const saveMeeting = async () => {
    try {
      if (meetingLinkType === "manual") {
        const u = manualUrl.trim();
        if (!u) {
          toast.error("Please paste a meeting URL when using Manual link.");
          return;
        }
        try {
          // eslint-disable-next-line no-new
          new URL(u);
        } catch {
          toast.error("Manual meeting URL looks invalid (must be a full https://… link).");
          return;
        }
      }

      await saveSettings({
        meetingLinkType,
        manualUrl,
        durationMin,
        bufferMin,
        weekly,
      });
      toast.success("Meeting details saved");
    } catch {
      toast.error("Failed to save");
    }
  };

  const onChangeWeekly = (day: number, key: "start" | "end", val: string) =>
    setWeekly((prev) =>
      prev.map((w) => (w.day === day ? { ...w, [key]: val } : w))
    );

  const formatDateTime = (ts: number) =>
    new Date(ts).toLocaleString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl md:text-4xl">Calendar</h1>

      {/* 1) Personal calendar */}
      <Card>
        <CardHeader>
          <CardTitle>Your personal calendar</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="space-y-1">
            {account ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Connected</Badge>
                <Badge variant="outline">
                  {account.provider === "microsoft" ? "Microsoft 365" : "Google"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {account.email ??
                    (account.provider === "microsoft" ? "Microsoft Calendar" : "Google Calendar")}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Connect a calendar to read availability and create events.
              </p>
            )}
          </div>
          {account ? (
            <Button variant="destructive" onClick={onDisconnect}>
              Disconnect
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onConnectGoogle}>
                Connect Google
              </Button>
              <Button onClick={onConnectMicrosoft}>Connect Microsoft</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2) Meeting details */}
      <Card>
        <CardHeader>
          <CardTitle>Meeting details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTitle>How this works</AlertTitle>
            <AlertDescription>
              <p>
                <span className="font-medium">Calendar connection</span> decides where events are created
                (Google Calendar vs Outlook/Microsoft 365).{" "}
                <span className="font-medium">Meeting link type</span> decides what join link we generate for
                bookings.
              </p>
              <p className="mt-2">
                <span className="font-medium">Tip:</span> if you connect a new provider, it replaces your
                previous calendar connection for this account (one active calendar per rep for now).
              </p>
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Meeting link type</Label>
              <Select
                value={meetingLinkType}
                onValueChange={(v: any) => setMeetingLinkType(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(!account || account.provider === "google") && (
                    <SelectItem value="google_meet">Google Meet (default)</SelectItem>
                  )}
                  {(!account || account.provider === "microsoft") && (
                    <SelectItem value="teams">Microsoft Teams</SelectItem>
                  )}
                  <SelectItem value="manual">Manual link</SelectItem>
                </SelectContent>
              </Select>
              {account?.provider === "google" && meetingLinkType === "google_meet" && (
                <p className="text-xs text-muted-foreground">
                  Meet links are created automatically on your Google Calendar events.
                </p>
              )}
              {account?.provider === "microsoft" && meetingLinkType === "teams" && (
                <p className="text-xs text-muted-foreground">
                  Teams links are created automatically on your Microsoft 365 calendar events.
                </p>
              )}
              {meetingLinkType === "manual" && (
                <p className="text-xs text-muted-foreground">
                  We will use your manual URL as the join link for visitors (Zoom, a static Teams room, etc.).
                </p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Manual meeting URL {meetingLinkType === "manual" ? "(required)" : "(optional)"}</Label>
              <Input
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://meet.example.com/your-room"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Select
                value={String(durationMin)}
                onValueChange={(v) => setDurationMin(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[15, 30, 45, 60].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Buffer (minutes)</Label>
              <Select
                value={String(bufferMin)}
                onValueChange={(v) => setBufferMin(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 5, 10, 15, 30].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={saveMeeting}>Save meeting details</Button>
        </CardContent>
      </Card>

      {/* 3) Weekly availability */}
      <Card>
        <CardHeader>
          <CardTitle>Set your availability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Visitors see options in their timezone; actual slots exclude your
            busy events.
          </p>
          <Separator />
          {DAYS.map(({ label, day }) => (
            <div key={day} className="grid items-center gap-4 md:grid-cols-3">
              <Label className="text-sm">{label}</Label>
              <Select
                value={weekly.find((w) => w.day === day)?.start ?? "09:00"}
                onValueChange={(v) => onChangeWeekly(day, "start", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={weekly.find((w) => w.day === day)?.end ?? "17:00"}
                onValueChange={(v) => onChangeWeekly(day, "end", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <Button onClick={saveMeeting}>Save availability</Button>
        </CardContent>
      </Card>

      {/* 4) Upcoming meetings */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming meetings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!bookings && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          {bookings && bookings.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No upcoming meetings yet.
            </p>
          )}

          {bookings && bookings.length > 0 && (
            <div className="space-y-2">
              {bookings.map((b: Doc<"calendarBookings">) => (
                <div
                  key={b._id}
                  className="flex flex-col gap-1 rounded-md border bg-background p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {b.attendeeName}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({b.attendeeEmail})
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.providerData?.company && `${b.providerData.company} · `}
                      {b.providerData?.role}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(b.start)}
                    </p>
                  </div>
                  {b.meetingUrl && (
                    <Button
                      className="mt-2 md:mt-0"
                      size="sm"
                      variant="outline"
                      asChild
                    >
                      <a href={b.meetingUrl} target="_blank" rel="noreferrer">
                        Join
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
