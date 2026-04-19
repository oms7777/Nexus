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

import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";

export const IntegrationsView = () => {
  const { organization } = useOrganization();
  const ent = useEntitlements();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSnippet, setSelectedSnippet] = useState("");

  // ✅ new entitlements shape
  const showSlack = !!ent.isActive && !!ent.canUseSlack;
  const showSalesforce = !!ent.isActive && !!ent.canUseSalesforce;
  const showHubspot = !!ent.isActive && !!ent.canUseHubspot;

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

  const hubspotIntegration = useQuery(
    api.integrations.getHubSpotIntegration,
    showHubspot ? {} : ("skip" as any)
  );

  const hubspotAppConfig = useQuery(
    api.integrations.getHubSpotAppConfig,
    showHubspot ? {} : ("skip" as any)
  );

  const oauthHints = useQuery(
    api.integrations.getInboundlessOAuthEnvHints,
    showSalesforce || showHubspot ? {} : ("skip" as any)
  );

  // Local form state for Salesforce app config
  const [sfClientId, setSfClientId] = useState("");
  const [sfClientSecret, setSfClientSecret] = useState("");
  const [sfLoginUrl, setSfLoginUrl] = useState("https://login.salesforce.com");
  const [sfSaving, setSfSaving] = useState(false);
  const [hsClientId, setHsClientId] = useState("");
  const [hsClientSecret, setHsClientSecret] = useState("");
  const [hsSaving, setHsSaving] = useState(false);
  const [domainInput, setDomainInput] = useState("");

  const websites = useQuery((api as any).private.websites.list, {}) ?? [];

  const handleAddDomain = async () => {
    const d = domainInput.trim();
    if (!d) return toast.error("Enter a domain (e.g. whoz.com)");
    try {
      await fetch("/api/websites/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: d }),
      });
      setDomainInput("");
      toast.success("Domain added");
    } catch {
      toast.error("Failed to add domain");
    }
  };

  const handleRemoveDomain = async (websiteId: string) => {
    try {
      await fetch("/api/websites/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteId }),
      });
      toast.success("Domain removed");
    } catch {
      toast.error("Failed to remove domain");
    }
  };

  useEffect(() => {
    if (!salesforceAppConfig) return;
    setSfClientId(salesforceAppConfig.clientId ?? "");
    setSfClientSecret(salesforceAppConfig.clientSecret ?? "");
    setSfLoginUrl((salesforceAppConfig.loginUrl ?? "https://login.salesforce.com").trim());
  }, [salesforceAppConfig]);

  useEffect(() => {
    if (!hubspotAppConfig) return;
    setHsClientId(hubspotAppConfig.clientId ?? "");
    setHsClientSecret(hubspotAppConfig.clientSecret ?? "");
  }, [hubspotAppConfig]);

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

  const { isHubspotConnected, hubspotPortalLabel } = useMemo(() => {
    if (!hubspotIntegration) {
      return { isHubspotConnected: false, hubspotPortalLabel: "" };
    }
    const label =
      hubspotIntegration.hubDomain?.trim() ||
      (hubspotIntegration.portalId ? `Portal ${hubspotIntegration.portalId}` : "HubSpot");
    return { isHubspotConnected: true, hubspotPortalLabel: label };
  }, [hubspotIntegration]);

  const hasSalesforceDbConfig = useMemo(() => {
    return Boolean(
      (salesforceAppConfig?.clientId ?? "").trim() &&
        (salesforceAppConfig?.clientSecret ?? "").trim() &&
        (salesforceAppConfig?.loginUrl ?? "").trim()
    );
  }, [salesforceAppConfig]);

  /** Env fallbacks (INBOUNDLESS_SALESFORCE_*) or full row in Convex — enough to run OAuth. */
  const salesforceOAuthReady = useMemo(() => {
    return hasSalesforceDbConfig || !!oauthHints?.salesforceDefaultsAvailable;
  }, [hasSalesforceDbConfig, oauthHints?.salesforceDefaultsAvailable]);

  const canSaveSfConfig = useMemo(() => {
    return Boolean(sfClientId.trim() && sfClientSecret.trim() && sfLoginUrl.trim());
  }, [sfClientId, sfClientSecret, sfLoginUrl]);

  const hasHubspotDbConfig = useMemo(() => {
    return Boolean(
      (hubspotAppConfig?.clientId ?? "").trim() && (hubspotAppConfig?.clientSecret ?? "").trim()
    );
  }, [hubspotAppConfig]);

  const hubspotOAuthReady = useMemo(() => {
    return hasHubspotDbConfig || !!oauthHints?.hubspotDefaultsAvailable;
  }, [hasHubspotDbConfig, oauthHints?.hubspotDefaultsAvailable]);

  const canSaveHsConfig = useMemo(() => {
    return Boolean(hsClientId.trim() && hsClientSecret.trim());
  }, [hsClientId, hsClientSecret]);

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
    if (!salesforceOAuthReady) return toast.error("Add Salesforce credentials (or configure server defaults).");
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

  const handleHubspotConnect = () => {
    if (!organization) return toast.error("Organization ID not found");
    if (!hubspotOAuthReady) return toast.error("Add HubSpot credentials (or configure server defaults).");
    window.location.href = "/api/integrations/hubspot/start";
  };

  const handleHubspotDisconnect = async () => {
    try {
      const res = await fetch("/api/integrations/hubspot/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      toast.success("HubSpot disconnected");
      window.location.reload();
    } catch {
      toast.error("Failed to disconnect HubSpot");
    }
  };

  const handleSaveHubspotConfig = async () => {
    if (!organization) return toast.error("Organization ID not found");
    if (!canSaveHsConfig) return toast.error("Fill Client ID and Client Secret.");

    try {
      setHsSaving(true);
      const res = await fetch("/api/integrations/hubspot/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: hsClientId.trim(),
          clientSecret: hsClientSecret.trim(),
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed");
      }

      toast.success("HubSpot config saved");
    } catch (e: any) {
      toast.error(`Failed to save HubSpot config${e?.message ? `: ${e.message}` : ""}`);
    } finally {
      setHsSaving(false);
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
            {!ent.isActive ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Plan not active yet (e.g. Starter before go-live)—you can still copy the install snippet below. Full
                behavior may require an active or trial plan.
              </p>
            ) : null}
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

          {/* Website widget — available on every active plan (incl. Starter) */}
          <div className="mt-8 space-y-6">
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

          {/* Allowed domains (enterprise safety) */}
          <div className="mt-6 space-y-3 rounded-lg border bg-background p-4">
            <div className="space-y-1">
              <Label className="text-lg">Allowed domains</Label>
              <p className="text-sm text-muted-foreground">
                For security, we only accept tracking/snapshots from the domains you add here. Add your production domain
                (e.g. <span className="font-mono">whoz.com</span>) and optionally{" "}
                <span className="font-mono">www.whoz.com</span>.
              </p>
            </div>

            <div className="flex gap-2">
              <Input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="whoz.com"
                className="bg-background"
              />
              <Button onClick={handleAddDomain} size="sm">
                Add
              </Button>
            </div>

            {websites.length ? (
              <div className="space-y-2">
                {websites
                  .filter((w: any) => w.active)
                  .map((w: any) => (
                    <div key={w._id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                      <div className="font-mono">{w.domain}</div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRemoveDomain(String(w._id))}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-xs text-amber-600">
                No domains configured yet. Add your domain to enable visitor tracking safely in production.
              </p>
            )}
          </div>

          {(showSlack || showSalesforce || showHubspot) && <Separator className="my-8" />}

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
                    disabled={!salesforceOAuthReady}
                    title={!salesforceOAuthReady ? "Add credentials or server defaults" : undefined}
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
                    {hasSalesforceDbConfig && <SavedBadge />}
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

                  {oauthHints?.salesforceDefaultsAvailable && !hasSalesforceDbConfig ? (
                    <p className="text-xs text-muted-foreground">
                      Inboundless server defaults are configured — you can connect without saving custom credentials
                      below. You can still save overrides per organization.
                    </p>
                  ) : null}
                  {!salesforceOAuthReady && (
                    <p className="text-xs text-amber-600">
                      Save Salesforce Client ID, Secret and Login URL, or set{" "}
                      <span className="font-mono">INBOUNDLESS_SALESFORCE_*</span> on the server (Vercel + Convex).
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* HubSpot (only if allowed) */}
          {showHubspot && (
            <div className="mt-4 space-y-4 rounded-lg border bg-background p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-lg">HubSpot</Label>
                    {isHubspotConnected && <ConnectedBadge />}
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Sync booked visitors as HubSpot contacts (OAuth).
                  </p>

                  {isHubspotConnected && (
                    <p className="text-xs text-muted-foreground">
                      Connected to <span className="font-mono">{hubspotPortalLabel}</span>.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleHubspotConnect}
                    size="sm"
                    variant="default"
                    disabled={!hubspotOAuthReady}
                    title={!hubspotOAuthReady ? "Add credentials or server defaults" : undefined}
                  >
                    {isHubspotConnected ? "Reconnect HubSpot" : "Connect HubSpot"}
                  </Button>

                  {isHubspotConnected && (
                    <Button onClick={handleHubspotDisconnect} size="sm" variant="destructive">
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-3 rounded-lg bg-muted/50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">HubSpot OAuth app</Label>
                    {hasHubspotDbConfig && <SavedBadge />}
                  </div>
                  <Button size="sm" onClick={handleSaveHubspotConfig} disabled={!canSaveHsConfig || hsSaving}>
                    {hsSaving ? "Saving..." : "Save"}
                  </Button>
                </div>

                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="hs-client-id">Client ID</Label>
                    <Input
                      id="hs-client-id"
                      placeholder="HubSpot app client id"
                      value={hsClientId}
                      onChange={(e) => setHsClientId(e.target.value)}
                      className="bg-background"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="hs-client-secret">Client Secret</Label>
                    <Input
                      id="hs-client-secret"
                      placeholder="HubSpot app client secret"
                      value={hsClientSecret}
                      onChange={(e) => setHsClientSecret(e.target.value)}
                      className="bg-background"
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    In the HubSpot developer project (<span className="font-mono">app-hsmeta.json</span> →{" "}
                    <span className="font-mono">redirectUrls</span>), allow this callback on each environment, e.g.{" "}
                    <span className="font-mono">http://localhost:3000/api/integrations/hubspot/callback</span> and your
                    production origin with the same path.
                  </p>

                  {oauthHints?.hubspotDefaultsAvailable && !hasHubspotDbConfig ? (
                    <p className="text-xs text-muted-foreground">
                      Inboundless server defaults are configured — you can connect without saving custom credentials
                      below.
                    </p>
                  ) : null}
                  {!hubspotOAuthReady && (
                    <p className="text-xs text-amber-600">
                      Save HubSpot Client ID and Secret, or set <span className="font-mono">INBOUNDLESS_HUBSPOT_*</span>{" "}
                      on the server (Vercel + Convex).
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
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
