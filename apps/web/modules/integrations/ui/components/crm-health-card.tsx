"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardTitle } from "@workspace/ui/components/card";

function fmtRelative(ts: number | null | undefined) {
  if (ts == null) return "Never";
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function providerLabel(p: string) {
  return p === "hubspot" ? "HubSpot" : p === "salesforce" ? "Salesforce" : p;
}

/**
 * Compact CRM health for Integrations: connected? bookings linked? deals found? Sync now.
 */
export function CrmHealthCard({ enabled }: { enabled: boolean }) {
  const health = useQuery(
    api.private.attribution.getCrmHealth,
    enabled ? {} : ("skip" as const),
  );
  const sync = useAction(api.private.attribution.requestRevenueSync);
  const [syncing, setSyncing] = useState(false);

  if (!enabled || health === undefined) return null;
  if (!health.entitled) return null;

  const providers =
    health.providers.length > 0
      ? health.providers.map(providerLabel).join(" · ")
      : "None connected";

  const onSync = async () => {
    setSyncing(true);
    try {
      const res = await sync({});
      toast.success(
        res.checked === 0
          ? "Nothing to sync right now"
          : `Checked ${res.checked} booking${res.checked === 1 ? "" : "s"} · ${res.matched} deal${res.matched === 1 ? "" : "s"} matched`,
      );
    } catch (e: any) {
      toast.error(e?.message ? String(e.message).slice(0, 160) : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">CRM health</CardTitle>
              {health.crmConnected ? (
                <Badge
                  variant="secondary"
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                >
                  Connected
                </Badge>
              ) : (
                <Badge variant="secondary" className="border-amber-500/30 bg-amber-500/10 text-amber-900">
                  Not connected
                </Badge>
              )}
            </div>
            <CardDescription>
              Last 90 days — bookings create CRM records; attribution fills pipeline € on Overview.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!health.crmConnected || syncing}
            onClick={() => void onSync()}
          >
            <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <Row label="Providers" value={providers} />
          <Row label="Last attribution check" value={fmtRelative(health.lastAttributionCheckedAt)} />
          <Row
            label="Meetings with CRM link"
            value={`${health.meetingsWithCrmLink} / ${health.meetings}`}
          />
          <Row label="Deals attributed" value={String(health.dealCount)} />
        </div>

        {health.crmConnected && health.meetings > 0 && health.meetingsWithCrmLink === 0 ? (
          <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            CRM is connected but recent bookings have no Lead/Contact id. Re-book a test meeting after
            connect, or reconnect Salesforce / HubSpot.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}
