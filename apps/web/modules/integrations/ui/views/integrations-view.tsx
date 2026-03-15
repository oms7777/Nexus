// IntegrationsView.tsx (rewrite with entitlements v2)
"use client";

import { useOrganization } from "@clerk/nextjs";
import Image from "next/image";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { CopyIcon } from "lucide-react";

import { IntegrationId, INTEGRATIONS } from "../../constants";
import { createScript } from "../../utils";

import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

import { useEntitlements } from "@/modules/billing/hooks/use-entitlements";

export const IntegrationsView = () => {
  const { organization } = useOrganization();
  const ent = useEntitlements();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSnippet, setSelectedSnippet] = useState("");

  // ✅ new entitlements shape
  const showSlack = !!ent.isActive && !!ent.canUseSlack;
  const showSalesforce = !!ent.isActive && !!ent.canUseSalesforce;

  const slackIntegration = useQuery(
    api.integrations.getSlackIntegration,
    showSlack ? {} : ("skip" as any)
  );

  const salesforceIntegration = useQuery(
    api.integrations.getSalesforceIntegration,
    showSalesforce ? {} : ("skip" as any)
  );

  const salesforceAppConfig = useQuery(
    api.integrations.getSalesforceAppConfig,
    showSalesforce ? {} : ("skip" as any)
  );

  // Local form state for Salesforce app config
  const [sfClientId, setSfClientId] = useState("");
  const [sfClientSecret, setSfClientSecret] = useState("");
  const [sfLoginUrl, setSfLoginUrl] = useState("https://login.salesforce.com");
  const [sfSaving, setSfSaving] = useState(false);

  useEffect(() => {
    if (!salesforceAppConfig) return;
    setSfClientId(salesforceAppConfig.clientId ?? "");
    setSfClientSecret(salesforceAppConfig.clientSecret ?? "");
    setSfLoginUrl((salesforceAppConfig.loginUrl ?? "https://login.salesforce.com").trim());
  }, [salesforceAppConfig]);

  const { isSlackConnected, slackTeamLabel, slackChannelLabel } = useMemo(() => {
    if (!slackIntegration) {
      return { isSlackConnected: false, slackTeamLabel: "", slackChannelLabel: "" };
    }

    const team = slackIntegration.teamName || "Slack workspace";
    const rawChannel = slackIntegration.defaultChannel || "#general";
    const normalizedChannel = rawChannel.startsWith("#") ? rawChannel : `#${rawChannel}`;

    return { isSlackConnected: true, slackTeamLabel: team, slackChannelLabel: normalizedChannel };
  }, [slackIntegration]);

  const { isSalesforceConnected, salesforceInstanceLabel } = useMemo(() => {
    if (!salesforceIntegration) {
      return { isSalesforceConnected: false, salesforceInstanceLabel: "" };
    }

    const host = (() => {
      try {
        return new URL(salesforceIntegration.instanceUrl).host;
      } catch {
        return salesforceIntegration.instanceUrl;
      }
    })();

    return { isSalesforceConnected: true, salesforceInstanceLabel: host };
  }, [salesforceIntegration]);

  const isSalesforceConfigSaved = useMemo(() => {
    return Boolean(
      (salesforceAppConfig?.clientId ?? "").trim() &&
        (salesforceAppConfig?.clientSecret ?? "").trim() &&
        (salesforceAppConfig?.loginUrl ?? "").trim()
    );
  }, [salesforceAppConfig]);

  const canSaveSfConfig = useMemo(() => {
    return Boolean(sfClientId.trim() && sfClientSecret.trim() && sfLoginUrl.trim());
  }, [sfClientId, sfClientSecret, sfLoginUrl]);

  const handleIntegrationClick = (integrationId: IntegrationId) => {
    if (!organization) {
      toast.error("Organization ID not found");
      return;
    }
    const snippet = createScript(integrationId, organization.id);
    setSelectedSnippet(snippet);
    setDialogOpen(true);
  };

  const handleCopyOrgId = async () => {
    try {
      await navigator.clipboard.writeText(organization?.id ?? "");
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleSlackConnect = () => {
    if (!organization) return toast.error("Organization ID not found");
    window.location.href = "/api/integrations/slack/start";
  };

  const handleSalesforceConnect = () => {
    if (!organization) return toast.error("Organization ID not found");
    if (!isSalesforceConfigSaved) return toast.error("Save Salesforce credentials first.");
    window.location.href = "/api/integrations/salesforce/start";
  };

  const handleSlackDisconnect = async () => {
    try {
      const res = await fetch("/api/integrations/slack/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Slack disconnected");
      window.location.reload();
    } catch {
      toast.error("Failed to disconnect Slack");
    }
  };

  const handleSalesforceDisconnect = async () => {
    try {
      const res = await fetch("/api/integrations/salesforce/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Salesforce disconnected");
      window.location.reload();
    } catch {
      toast.error("Failed to disconnect Salesforce");
    }
  };

  const handleSaveSalesforceConfig = async () => {
    if (!organization) return toast.error("Organization ID not found");
    if (!canSaveSfConfig) return toast.error("Fill Client ID, Client Secret and Login URL.");

    try {
      setSfSaving(true);
      const res = await fetch("/api/integrations/salesforce/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: sfClientId.trim(),
          clientSecret: sfClientSecret.trim(),
          loginUrl: sfLoginUrl.trim(),
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed");
      }

      toast.success("Salesforce config saved");
    } catch (e: any) {
      toast.error(`Failed to save Salesforce config${e?.message ? `: ${e.message}` : ""}`);
    } finally {
      setSfSaving(false);
    }
  };

  const ConnectedBadge = ({ label = "Connected" }: { label?: string }) => (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      {label}
    </span>
  );

  const SavedBadge = ({ label = "Saved" }: { label?: string }) => (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      <span className="h-2 w-2 rounded-full bg-slate-500" />
      {label}
    </span>
  );

  if (ent.isLoading) return null;

  return (
    <>
      <IntegrationsDialog open={dialogOpen} onOpenChange={setDialogOpen} snippet={selectedSnippet} />

      <div className="flex min-h-screen flex-col bg-muted p-8">
        <div className="mx-auto w-full max-w-screen-md">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-4xl">Setup & Integrations</h1>
            <p className="text-muted-foreground">Connect your tools and add the widget to your website.</p>
          </div>

          {/* Org ID */}
          <div className="mt-8 space-y-6">
            <div className="flex items-center gap-4">
              <Label className="w-34" htmlFor="organization-id">
                Organization ID
              </Label>
              <Input
                disabled
                id="organization-id"
                readOnly
                value={organization?.id ?? ""}
                className="flex-1 bg-background font-mono text-sm"
              />
              <Button className="gap-2" onClick={handleCopyOrgId} size="sm">
                <CopyIcon className="size-4" />
                Copy
              </Button>
            </div>
          </div>

          {/* Slack (only if allowed) */}
          {showSlack && (
            <div className="mt-8 space-y-3 rounded-lg border bg-background p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-lg">Slack</Label>
                    {isSlackConnected && <ConnectedBadge />}
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Connect Slack to receive new meeting notifications in your workspace.
                  </p>

                  {isSlackConnected && (
                    <p className="text-xs text-muted-foreground">
                      Connected to <span className="font-medium">{slackTeamLabel}</span> &middot; Notifications sent
                      to <span className="font-mono">{slackChannelLabel}</span>.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={handleSlackConnect} size="sm" variant="default">
                    {isSlackConnected ? "Reconnect Slack" : "Connect Slack"}
                  </Button>

                  {isSlackConnected && (
                    <Button onClick={handleSlackDisconnect} size="sm" variant="destructive">
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Salesforce (only if allowed) */}
          {showSalesforce && (
            <div className="mt-4 space-y-4 rounded-lg border bg-background p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-lg">Salesforce</Label>
                    {isSalesforceConnected && <ConnectedBadge />}
                  </div>

                  <p className="text-sm text-muted-foreground">Automatically create leads and meetings in Salesforce.</p>

                  {isSalesforceConnected && (
                    <p className="text-xs text-muted-foreground">
                      Connected to <span className="font-mono">{salesforceInstanceLabel}</span>.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSalesforceConnect}
                    size="sm"
                    variant="default"
                    disabled={!isSalesforceConfigSaved}
                    title={!isSalesforceConfigSaved ? "Save Salesforce credentials first" : undefined}
                  >
                    {isSalesforceConnected ? "Reconnect Salesforce" : "Connect Salesforce"}
                  </Button>

                  {isSalesforceConnected && (
                    <Button onClick={handleSalesforceDisconnect} size="sm" variant="destructive">
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>

              {/* OAuth Config */}
              <div className="space-y-3 rounded-lg bg-muted/50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Salesforce OAuth App Configuration</Label>
                    {isSalesforceConfigSaved && <SavedBadge />}
                  </div>
                  <Button size="sm" onClick={handleSaveSalesforceConfig} disabled={!canSaveSfConfig || sfSaving}>
                    {sfSaving ? "Saving..." : "Save"}
                  </Button>
                </div>

                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="sf-client-id">Client ID (Consumer Key)</Label>
                    <Input
                      id="sf-client-id"
                      placeholder="e.g. 3MVG9..."
                      value={sfClientId}
                      onChange={(e) => setSfClientId(e.target.value)}
                      className="bg-background"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="sf-client-secret">Client Secret (Consumer Secret)</Label>
                    <Input
                      id="sf-client-secret"
                      placeholder="Paste the Consumer Secret"
                      value={sfClientSecret}
                      onChange={(e) => setSfClientSecret(e.target.value)}
                      className="bg-background"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="sf-login-url">Login URL</Label>
                    <Input
                      id="sf-login-url"
                      placeholder="https://login.salesforce.com"
                      value={sfLoginUrl}
                      onChange={(e) => setSfLoginUrl(e.target.value)}
                      className="bg-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use <span className="font-mono">https://login.salesforce.com</span> (prod/dev) or{" "}
                      <span className="font-mono">https://test.salesforce.com</span> (sandbox).
                    </p>
                  </div>

                  {!isSalesforceConfigSaved && (
                    <p className="text-xs text-amber-600">
                      Save your Salesforce Client ID/Secret first to enable “Connect Salesforce”.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <Separator className="my-8" />

          {/* Widget embed snippets (toujours ok) */}
          <div className="space-y-6">
            <div className="space-y-1">
              <Label className="text-lg">Website widget</Label>
              <p className="text-sm text-muted-foreground">Add the following code to your website to enable the chatbox.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {INTEGRATIONS.map((integration) => (
                <button
                  key={integration.id}
                  onClick={() => handleIntegrationClick(integration.id)}
                  type="button"
                  className="flex items-center gap-4 rounded-lg border bg-background p-4 hover:bg-accent"
                >
                  <Image alt={integration.title} height={32} src={integration.icon} width={32} />
                  <p>{integration.title}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export const IntegrationsDialog = ({
  open,
  onOpenChange,
  snippet,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  snippet: string;
}) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      toast.error("Failed to copy to clipboard");
      return;
    }
    toast.success("Copied to clipboard");
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Integrate with your website</DialogTitle>
          <DialogDescription>Same script for any site (HTML, React, Next.js, etc.). Paste it in your page&apos;s &lt;head&gt; or in index.html / root layout.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <div className="rounded-md bg-accent p-2 text-sm">1. Copy the following code</div>
            <div className="group relative">
              <pre className="max-h-[300px] overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-foreground p-2 font-mono text-secondary text-sm">
                {snippet}
              </pre>
              <Button
                className="absolute right-6 top-4 size-6 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={handleCopy}
                size="icon"
                variant="secondary"
              >
                <CopyIcon className="size-3" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="rounded-md bg-accent p-2 text-sm">2. Add the code in your page</div>
            <p>Paste the chatbox code above in your page. You can add it in the HTML head section.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
