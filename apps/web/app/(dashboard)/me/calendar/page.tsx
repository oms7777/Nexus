// apps/web/app/(dashboard)/me/calendar/page.tsx
"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { toast } from "sonner";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import { useEffect, useState } from "react";

const DAYS = [
  { label: "Monday", day: 1 }, { label: "Tuesday", day: 2 }, { label: "Wednesday", day: 3 },
  { label: "Thursday", day: 4 }, { label: "Friday", day: 5 },
];

const TIMES = [
  "08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30",
  "12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30",
  "16:00","16:30","17:00","17:30","18:00"
];

export default function Page() {
  const account = useQuery(api.private.calendar.meConnection, {});
  const settings = useQuery(api.private.calendar.mySettings, {});
  const saveSettings = useMutation(api.private.calendar.saveMySettings);

  const [meetingLinkType, setMeetingLinkType] = useState<"google_meet"|"manual">("google_meet");
  const [manualUrl, setManualUrl] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [bufferMin, setBufferMin] = useState(0);
  const [weekly, setWeekly] = useState<{day:number;start:string;end:string}[]>(
    DAYS.map(d => ({ day: d.day, start: "09:00", end: "17:00" }))
  );

  useEffect(() => {
    if (settings) {
      setMeetingLinkType(settings.meetingLinkType ?? "google_meet");
      setManualUrl(settings.manualUrl ?? "");
      setDurationMin(settings.durationMin ?? 30);
      setBufferMin(settings.bufferMin ?? 0);
      setWeekly(settings.weekly ?? weekly);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?. _id]);

  const onConnect = () => { window.location.href = "/api/integrations/google/start"; };
  const disconnect = useMutation(api.private.calendar.disconnect);
  const onDisconnect = async () => {
    try { await disconnect({}); toast.success("Disconnected"); }
    catch { toast.error("Failed to disconnect"); }
  };

  const saveMeeting = async () => {
    try {
      await saveSettings({ meetingLinkType, manualUrl, durationMin, bufferMin, weekly });
      toast.success("Meeting details saved");
    } catch { toast.error("Failed to save"); }
  };

  const onChangeWeekly = (day: number, key: "start"|"end", val: string) =>
    setWeekly(prev => prev.map(w => w.day===day? {...w, [key]: val} : w));

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl md:text-4xl">Calendar</h1>

      {/* 1) Personal calendar */}
      <Card className="mb-6">
        <CardHeader><CardTitle>Your personal calendar</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="space-y-1">
            {account ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Connected</Badge>
                <span className="text-sm text-muted-foreground">
                  {account.email ?? "Google Calendar"}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Connect Google Calendar to read availability and create events.
              </p>
            )}
          </div>
          {account ? (
            <Button variant="destructive" onClick={onDisconnect}>Disconnect</Button>
          ) : (
            <Button onClick={onConnect}>Connect Google Calendar</Button>
          )}
        </CardContent>
      </Card>

      {/* 2) Meeting details */}
      <Card className="mb-6">
        <CardHeader><CardTitle>Meeting details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Meeting link type</Label>
              <Select value={meetingLinkType} onValueChange={(v:any)=>setMeetingLinkType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google_meet">Google Meet (default)</SelectItem>
                  <SelectItem value="manual">Manual link</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Manual meeting URL (optional)</Label>
              <Input value={manualUrl} onChange={e=>setManualUrl(e.target.value)} placeholder="https://meet.example.com/your-room"/>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Select value={String(durationMin)} onValueChange={(v)=>setDurationMin(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[15,30,45,60].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Buffer (minutes)</Label>
              <Select value={String(bufferMin)} onValueChange={(v)=>setBufferMin(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0,5,10,15,30].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={saveMeeting}>Save meeting details</Button>
        </CardContent>
      </Card>

      {/* 3) Weekly availability (persisted + utilisé par freeSlots) */}
      <Card>
        <CardHeader><CardTitle>Set your availability</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Visitors see options in their timezone; actual slots exclude your busy events.
          </p>
          <Separator />
          {DAYS.map(({label, day}) => (
            <div key={day} className="grid items-center gap-4 md:grid-cols-3">
              <Label className="text-sm">{label}</Label>
              <Select
                value={weekly.find(w=>w.day===day)?.start ?? "09:00"}
                onValueChange={(v)=>onChangeWeekly(day, "start", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIMES.map(t=> <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Select
                value={weekly.find(w=>w.day===day)?.end ?? "17:00"}
                onValueChange={(v)=>onChangeWeekly(day, "end", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIMES.map(t=> <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ))}
          <Button onClick={saveMeeting}>Save availability</Button>
        </CardContent>
      </Card>
    </div>
  );
}
