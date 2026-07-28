"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import type { Id } from "@workspace/backend/_generated/dataModel";
import { AlertTriangleIcon, CopyIcon, PlusIcon, Trash2Icon, WebhookIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { toast } from "sonner";

const EVENT_LABELS: Record<string, string> = {
  "conversation.escalated": "Conversation escalated to a human",
  "conversation.resolved": "Conversation resolved",
  "meeting.booked": "Meeting booked",
  "lead.identified": "Lead identified",
};

function StatusBadge({
  lastStatus,
  isSuspended,
  active,
}: {
  lastStatus?: number;
  isSuspended: boolean;
  active: boolean;
}) {
  if (!active) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Paused
      </span>
    );
  }
  if (isSuspended) {
    return (
      <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
        Suspended
      </span>
    );
  }
  if (lastStatus === undefined) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        No delivery yet
      </span>
    );
  }
  const ok = lastStatus >= 200 && lastStatus < 300;
  return (
    <span
      className={
        ok
          ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300"
          : "rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300"
      }
    >
      HTTP {lastStatus}
    </span>
  );
}

/** Shown once after creation or rotation — the secret is never readable again. */
function SecretNotice({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success("Signing secret copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
        <AlertTriangleIcon className="size-3.5 shrink-0" />
        Copy your signing secret now — it will not be shown again.
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-background/70 px-2 py-1.5 font-mono text-xs">
          {secret}
        </code>
        <Button onClick={copy} size="sm" type="button" variant="secondary">
          <CopyIcon className="size-3.5" />
          Copy
        </Button>
        <Button onClick={onDismiss} size="sm" type="button" variant="ghost">
          Done
        </Button>
      </div>
    </div>
  );
}

export function WebhooksSection() {
  const data = useQuery(api.private.webhooks.list, {});
  const createWebhook = useMutation(api.private.webhooks.create);
  const updateWebhook = useMutation(api.private.webhooks.update);
  const rotateSecret = useMutation(api.private.webhooks.rotateSecret);
  const removeWebhook = useMutation(api.private.webhooks.remove);

  const [isCreating, setIsCreating] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const toggleEvent = (event: string) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  const handleCreate = async () => {
    if (!url.trim()) return;
    setIsSaving(true);
    try {
      const res = await createWebhook({ url: url.trim(), events });
      setRevealedSecret(res.secret);
      setUrl("");
      setEvents([]);
      setIsCreating(false);
      toast.success("Webhook created");
    } catch (e) {
      toast.error(
        (e as { data?: { message?: string } })?.data?.message ?? "Could not create the webhook",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleRotate = async (endpointId: Id<"webhookEndpoints">) => {
    try {
      const res = await rotateSecret({ endpointId });
      setRevealedSecret(res.secret);
      toast.success("Signing secret rotated");
    } catch {
      toast.error("Could not rotate the secret");
    }
  };

  const handleDelete = async (endpointId: Id<"webhookEndpoints">) => {
    try {
      await removeWebhook({ endpointId });
      toast.success("Webhook removed");
    } catch {
      toast.error("Could not remove the webhook");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <WebhookIcon className="size-4 shrink-0" />
              Webhooks
            </CardTitle>
            <CardDescription>
              Send Inboundless events to your own stack. Each request carries an{" "}
              <code className="rounded bg-muted px-1 text-xs">X-Inboundless-Signature</code> header
              you can verify with the signing secret.
            </CardDescription>
          </div>
          {isCreating ? null : (
            <Button onClick={() => setIsCreating(true)} size="sm" type="button">
              <PlusIcon className="size-3.5" />
              Add endpoint
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {revealedSecret ? (
          <SecretNotice onDismiss={() => setRevealedSecret(null)} secret={revealedSecret} />
        ) : null}

        {isCreating ? (
          <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input
                className="bg-background"
                id="webhook-url"
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/hooks/inboundless"
                value={url}
              />
              <p className="text-xs text-muted-foreground">
                Must be HTTPS and publicly reachable.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Events</Label>
              <div className="space-y-2">
                {(data?.availableEvents ?? []).map((event) => (
                  <label className="flex items-center gap-2 text-sm" key={event}>
                    <Checkbox
                      checked={events.includes(event)}
                      onCheckedChange={() => toggleEvent(event)}
                    />
                    <span className="text-foreground">{EVENT_LABELS[event] ?? event}</span>
                    <code className="rounded bg-muted px-1 text-[11px] text-muted-foreground">
                      {event}
                    </code>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave everything unchecked to receive all events.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setIsCreating(false);
                  setUrl("");
                  setEvents([]);
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={!url.trim() || isSaving} onClick={handleCreate} type="button">
                {isSaving ? "Creating…" : "Create webhook"}
              </Button>
            </div>
          </div>
        ) : null}

        {data === undefined ? (
          <Skeleton className="h-16" />
        ) : data.endpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No webhook configured yet.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {data.endpoints.map((endpoint) => (
              <li className="space-y-2 p-4" key={endpoint._id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <code className="min-w-0 truncate font-mono text-xs text-foreground">
                      {endpoint.url}
                    </code>
                    <StatusBadge
                      active={endpoint.active}
                      isSuspended={endpoint.isSuspended}
                      lastStatus={endpoint.lastStatus}
                    />
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      onClick={() =>
                        updateWebhook({ endpointId: endpoint._id, active: !endpoint.active })
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {endpoint.active ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      onClick={() => handleRotate(endpoint._id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Rotate secret
                    </Button>
                    <Button
                      onClick={() => handleDelete(endpoint._id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2Icon className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  {endpoint.events.length === 0
                    ? "All events"
                    : endpoint.events.map((e) => EVENT_LABELS[e] ?? e).join(" · ")}
                </div>

                {endpoint.isSuspended ? (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    Delivery is suspended after repeated failures
                    {endpoint.lastError ? `: ${endpoint.lastError}` : ""}. Edit the endpoint to
                    resume.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
