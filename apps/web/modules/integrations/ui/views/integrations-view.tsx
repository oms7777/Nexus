// IntegrationsView.tsx (rewrite with entitlements v2)
"use client";

import { useOrganization } from "@clerk/nextjs";
import Image from "next/image";
import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { SiHubspot, SiSalesforce, SiSlack } from "react-icons/si";

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@workspace/ui/components/collapsible";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import { Switch } from "@workspace/ui/components/switch";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { cn } from "@workspace/ui/lib/utils";
import { ChevronDown, CopyIcon, Globe, MessageSquare, Mic, Settings2 } from "lucide-react";

import { IntegrationId, INTEGRATIONS } from "../../constants";
import { createScript } from "../../utils";

import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";
import { VapiConnectionPanel } from "@/modules/plugins/ui/views/vapi-view";

export const IntegrationsView = () => {
  const { organization } = useOrganization();
  const ent = useEntitlements();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSnippet, setSelectedSnippet] = useState("");

  // ✅ new entitlements shape
  const showSlack = !!ent.isActive && !!ent.canUseSlack;
  const showSalesforce = !!ent.isActive && !!ent.canUseSalesforce;
  const showHubspot = !!ent.isActive && !!ent.canUseHubspot;
  const showVoice = !!ent.isActive && !!ent.canUseVoice;

  const canConfigureSalesforceByo = !!ent.features?.canConfigureSalesforceByo;
  const canConfigureHubspotByo = !!ent.features?.canConfigureHubspotByo;
  const canConfigureVoiceByo = !!ent.features?.canConfigureVoiceByo;

  const voiceSectionRef = useRef<HTMLDivElement>(null);

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
    showSalesforce || showHubspot || showVoice ? {} : ("skip" as any)
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

  // BYO: never re-hydrate secrets into the browser; allow "update without pasting" + optional replace flow.
  const [sfSecretReplaceMode, setSfSecretReplaceMode] = useState(false);
  const [hsSecretReplaceMode, setHsSecretReplaceMode] = useState(false);

  const websites = useQuery((api as any).private.websites.list, {}) ?? [];

  const widgetSettings = useQuery(api.private.widgetSettings.getOne);
  const upsertWidgetSettings = useMutation(api.private.widgetSettings.upsert);

  const [waEnabled, setWaEnabled] = useState(false);
  const [waDigits, setWaDigits] = useState("");
  const [waTemplate, setWaTemplate] = useState("");
  const [waUseRepFirst, setWaUseRepFirst] = useState(true);
  const [waSaving, setWaSaving] = useState(false);

  const [voicePanelOpen, setVoicePanelOpen] = useState(false);

  useEffect(() => {
    if (widgetSettings === undefined) return;
    setWaEnabled(!!(widgetSettings as any)?.whatsappHandoffEnabled);
    setWaDigits(String((widgetSettings as any)?.whatsappPhoneDigits ?? ""));
    setWaTemplate(String((widgetSettings as any)?.whatsappPrefillTemplate ?? ""));
    setWaUseRepFirst((widgetSettings as any)?.whatsappUseAssignedRepFirst !== false);
  }, [widgetSettings]);

  const handleSaveWhatsapp = async () => {
    try {
      setWaSaving(true);
      const digitsOnly = String(waDigits ?? "").replace(/\\D/g, "");
      await upsertWidgetSettings({
        whatsappHandoffEnabled: !!waEnabled,
        whatsappPhoneDigits: waEnabled ? digitsOnly : "",
        whatsappUseAssignedRepFirst: waUseRepFirst,
        whatsappPrefillTemplate: waTemplate?.trim() || undefined,
      } as any);
      toast.success("WhatsApp settings saved");
    } catch {
      toast.error("Failed to save WhatsApp settings");
    } finally {
      setWaSaving(false);
    }
  };

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
    // Do not hydrate secrets back into the browser.
    setSfClientSecret("");
    setSfSecretReplaceMode(false);
    setSfLoginUrl((salesforceAppConfig.loginUrl ?? "https://login.salesforce.com").trim());
  }, [salesforceAppConfig]);

  useEffect(() => {
    if (!hubspotAppConfig) return;
    setHsClientId(hubspotAppConfig.clientId ?? "");
    // Do not hydrate secrets back into the browser.
    setHsClientSecret("");
    setHsSecretReplaceMode(false);
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
        (salesforceAppConfig as any)?.hasClientSecret &&
        (salesforceAppConfig?.loginUrl ?? "").trim()
    );
  }, [salesforceAppConfig]);

  /** Env fallbacks (INBOUNDLESS_SALESFORCE_*) or full row in Convex — enough to run OAuth. */
  const salesforceOAuthReady = useMemo(() => {
    return hasSalesforceDbConfig || !!oauthHints?.salesforceDefaultsAvailable;
  }, [hasSalesforceDbConfig, oauthHints?.salesforceDefaultsAvailable]);

  const canSaveSfConfig = useMemo(() => {
    if (!sfClientId.trim() || !sfLoginUrl.trim()) return false;
    const hasSaved = Boolean((salesforceAppConfig as any)?.hasClientSecret);
    const hasNew = Boolean(sfClientSecret.trim());
    if (sfSecretReplaceMode) {
      // Replacing: require a new value (can't meaningfully "replace" with an empty string).
      return hasNew;
    }
    if (!hasSaved) {
      // First time: need a client secret
      return hasNew;
    }
    // Update without pasting: allowed (server keeps the existing secret)
    return true;
  }, [sfClientId, sfClientSecret, sfLoginUrl, salesforceAppConfig, sfSecretReplaceMode]);

  const hasHubspotDbConfig = useMemo(() => {
    return Boolean(
      (hubspotAppConfig?.clientId ?? "").trim() && (hubspotAppConfig as any)?.hasClientSecret
    );
  }, [hubspotAppConfig]);

  const hubspotOAuthReady = useMemo(() => {
    return hasHubspotDbConfig || !!oauthHints?.hubspotDefaultsAvailable;
  }, [hasHubspotDbConfig, oauthHints?.hubspotDefaultsAvailable]);

  const canSaveHsConfig = useMemo(() => {
    if (!hsClientId.trim()) return false;
    const hasSaved = Boolean((hubspotAppConfig as any)?.hasClientSecret);
    const hasNew = Boolean(hsClientSecret.trim());
    if (hsSecretReplaceMode) return hasNew;
    if (!hasSaved) return hasNew;
    return true;
  }, [hsClientId, hsClientSecret, hubspotAppConfig, hsSecretReplaceMode]);

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
    if (!canSaveHsConfig) return toast.error("Fill required fields (Client ID; Client Secret on first save).");

    try {
      setHsSaving(true);
      const res = await fetch("/api/integrations/hubspot/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: hsClientId.trim(),
          clientSecret: hsClientSecret.trim() || undefined,
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
    if (!canSaveSfConfig) {
      return toast.error(
        (salesforceAppConfig as any)?.hasClientSecret
          ? "Fill Client ID and Login URL, or use Replace to update the Client Secret."
          : "Fill Client ID, Client Secret and Login URL (first time)."
      );
    }

    try {
      setSfSaving(true);
      const res = await fetch("/api/integrations/salesforce/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: sfClientId.trim(),
          clientSecret: sfClientSecret.trim() || undefined,
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

  const salesforceByoCollapsedByDefault =
    oauthHints?.salesforceDefaultsAvailable === true &&
    !hasSalesforceDbConfig &&
    salesforceOAuthReady;

  const hubspotByoCollapsedByDefault =
    oauthHints?.hubspotDefaultsAvailable === true && !hasHubspotDbConfig && hubspotOAuthReady;

  useEffect(() => {
    if (ent.isLoading) return;
    if (typeof window === "undefined" || window.location.hash !== "#voice") return;
    if (!showVoice) return;
    setVoicePanelOpen(true);
    const id = window.setTimeout(() => {
      voiceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [ent.isLoading, showVoice]);

  if (ent.isLoading) return null;

  return (
    <>
      <IntegrationsDialog open={dialogOpen} onOpenChange={setDialogOpen} snippet={selectedSnippet} />

      <div className="flex min-h-screen flex-col bg-gradient-to-b from-background via-background to-muted/40">
        <div className="mx-auto w-full max-w-3xl space-y-10 px-6 py-10 md:px-8">
          {/* Page intro */}
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Integrations</h1>
            <p className="text-base text-muted-foreground">
              Connect Slack, CRM, voice (Vapi), and the on-site chat. Advanced options stay tucked away until you need
              them.
            </p>
            {!ent.isActive ? (
              <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                Your plan is not fully active yet. You can still grab the chat install snippet below; some features may
                need an active or trial plan.
              </p>
            ) : null}
          </header>

          {/* Chat widget */}
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">On your website</h2>
            <Card className="border-border/60 shadow-sm transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-start gap-4 pb-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <MessageSquare className="size-6" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <CardTitle className="text-lg">Chat widget</CardTitle>
                  <CardDescription>
                    Add one script tag to show the Inboundless visitor chat on your site or app, no framework required.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button className="w-fit" onClick={() => handleIntegrationClick("widget")} size="default" type="button">
                  Get install snippet
                </Button>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {INTEGRATIONS.map((integration) => (
                    <span
                      key={integration.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1"
                      title={integration.title}
                    >
                      <Image alt="" height={16} src={integration.icon} width={16} className="opacity-90" />
                      <span className="sr-only">{integration.title}</span>
                    </span>
                  ))}
                  <span>HTML, React, Next.js, …</span>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Allowed domains */}
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Security</h2>
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="flex flex-row items-start gap-4 pb-2">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Globe className="size-5" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-base">Allowed domains</CardTitle>
                  <CardDescription>
                    Sessions and snapshots are only accepted from domains you list, add production (and www) before going
                    live.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    placeholder="example.com"
                    className="bg-background"
                  />
                  <Button className="shrink-0 sm:w-auto" onClick={handleAddDomain} type="button" variant="secondary">
                    Add domain
                  </Button>
                </div>

                {websites.length ? (
                  <ul className="space-y-2">
                    {websites
                      .filter((w: any) => w.active)
                      .map((w: any) => (
                        <li
                          key={w._id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm"
                        >
                          <span className="font-medium">{w.domain}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleRemoveDomain(String(w._id))}
                            type="button"
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                    No domains yet—add yours so visitor data is accepted only from trusted hosts.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Advanced: org ID (support) */}
          <Collapsible className="rounded-xl border border-dashed border-border/80 bg-muted/20">
            <CollapsibleTrigger
              className={cn(
                "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium",
                "hover:bg-muted/40 [&[data-state=open]]:rounded-b-none [&[data-state=open]]:border-b [&[data-state=open]]:border-border/60"
              )}
              type="button"
            >
              <span className="text-muted-foreground">Technical details</span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 px-4 pb-4 pt-1">
              <p className="text-xs text-muted-foreground">
                Share this identifier with support if you open a ticket. It is already embedded in your install snippet.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Label className="sr-only shrink-0 sm:w-36" htmlFor="organization-id">
                  Organization ID
                </Label>
                <Input
                  disabled
                  id="organization-id"
                  readOnly
                  value={organization?.id ?? ""}
                  className="flex-1 bg-background font-mono text-xs md:text-sm"
                />
                <Button className="gap-2 sm:shrink-0" onClick={handleCopyOrgId} size="sm" type="button" variant="outline">
                  <CopyIcon className="size-4" />
                  Copy ID
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {(showSlack || showSalesforce || showHubspot || showVoice) && (
            <>
              <Separator className="my-2" />
              <section className="space-y-4">
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  Connected services
                </h2>

                {/* Slack */}
                {showSlack && (
                  <>
                    <div className="pt-1">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Messaging
                      </h3>
                    </div>
                  <Card className="overflow-hidden border-border/60 shadow-sm">
                    <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-4">
                        <div
                          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#4A154B]/12"
                          aria-hidden
                        >
                          <SiSlack className="size-7 text-[#4A154B]" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-lg">Slack</CardTitle>
                            {isSlackConnected ? (
                              <Badge
                                variant="secondary"
                                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                              >
                                Connected
                              </Badge>
                            ) : null}
                          </div>
                          <CardDescription>
                            Meeting and lead notifications in a channel your team already uses.
                          </CardDescription>
                          {isSlackConnected ? (
                            <p className="text-xs text-muted-foreground">
                              Workspace <span className="font-medium text-foreground">{slackTeamLabel}</span> ·{" "}
                              <span className="font-medium">{slackChannelLabel}</span>
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button onClick={handleSlackConnect} size="sm" type="button">
                          {isSlackConnected ? "Reconnect" : "Connect Slack"}
                        </Button>
                        {isSlackConnected ? (
                          <Button onClick={handleSlackDisconnect} size="sm" type="button" variant="outline">
                            Disconnect
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                  </>
                )}

                {/* Salesforce */}
                {showSalesforce && (
                  <>
                    <div className="pt-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        CRM
                      </h3>
                    </div>
                  <Card className="overflow-hidden border-border/60 shadow-sm">
                    <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-4">
                        <div
                          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/12"
                          aria-hidden
                        >
                          <SiSalesforce className="size-7 text-sky-600 dark:text-sky-400" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-lg">Salesforce</CardTitle>
                            {isSalesforceConnected ? (
                              <Badge
                                variant="secondary"
                                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                              >
                                Connected
                              </Badge>
                            ) : null}
                          </div>
                          <CardDescription>Create leads and reflect meetings from Inboundless in Salesforce.</CardDescription>
                          {isSalesforceConnected ? (
                            <p className="text-xs text-muted-foreground">
                              Instance{" "}
                              <span className="font-medium text-foreground">{salesforceInstanceLabel}</span>
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          disabled={!salesforceOAuthReady}
                          onClick={handleSalesforceConnect}
                          size="sm"
                          title={!salesforceOAuthReady ? "Configure connection (see optional section below)" : undefined}
                          type="button"
                        >
                          {isSalesforceConnected ? "Reconnect" : "Connect"}
                        </Button>
                        {isSalesforceConnected ? (
                          <Button onClick={handleSalesforceDisconnect} size="sm" type="button" variant="outline">
                            Disconnect
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>

                    {canConfigureSalesforceByo ? (
                    <div className="border-t border-border/60 bg-muted/20 px-4 py-4">
                      <Collapsible
                        key={`sf-${String(oauthHints?.salesforceDefaultsAvailable)}-${String(hasSalesforceDbConfig)}`}
                        defaultOpen={!salesforceByoCollapsedByDefault}
                      >
                        <CollapsibleTrigger
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left text-sm font-medium",
                            "hover:bg-muted/60 [&[data-state=open]]:border-border/60 [&[data-state=open]]:bg-muted/40"
                          )}
                          type="button"
                        >
                          <span className="flex items-center gap-2">
                            <Settings2 className="size-4 shrink-0 text-muted-foreground" />
                            <span>
                              {salesforceByoCollapsedByDefault
                                ? "Use your own Salesforce Connected App"
                                : "Salesforce OAuth credentials"}
                              <span className="ml-1.5 font-normal text-muted-foreground">
                                {salesforceByoCollapsedByDefault ? "(optional)" : ""}
                              </span>
                            </span>
                            {hasSalesforceDbConfig ? (
                              <Badge variant="outline" className="ml-2 font-normal">
                                Saved for this org
                              </Badge>
                            ) : null}
                          </span>
                          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                          <div className="mt-3 space-y-4 rounded-lg border border-border/60 bg-background p-4 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-xs text-muted-foreground">
                                Only needed if your org uses a custom Salesforce app instead of the default connection.
                              </p>
                              <Button
                                size="sm"
                                onClick={handleSaveSalesforceConfig}
                                disabled={!canSaveSfConfig || sfSaving}
                                type="button"
                                variant="secondary"
                              >
                                {sfSaving ? "Saving…" : "Save credentials"}
                              </Button>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-1">
                              <div className="grid gap-2">
                                <Label htmlFor="sf-client-id">Client ID (Consumer Key)</Label>
                                <Input
                                  id="sf-client-id"
                                  placeholder="From your Connected App"
                                  value={sfClientId}
                                  onChange={(e) => setSfClientId(e.target.value)}
                                  className="bg-background"
                                  autoComplete="off"
                                />
                              </div>

                              <div className="grid gap-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <Label htmlFor="sf-client-secret">Client Secret</Label>
                                    {(salesforceAppConfig as any)?.hasClientSecret && !sfSecretReplaceMode ? (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        Saved in Inboundless. For security, the secret is never shown again—use{" "}
                                        <span className="font-medium text-foreground">Replace</span> to set a new one.
                                      </p>
                                    ) : null}
                                    {(salesforceAppConfig as any)?.hasClientSecret && sfSecretReplaceMode ? (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        Paste the new Client Secret from your Salesforce Connected App, then save.
                                      </p>
                                    ) : null}
                                  </div>
                                  {(salesforceAppConfig as any)?.hasClientSecret ? (
                                    <Button
                                      className="shrink-0"
                                      onClick={() => {
                                        setSfSecretReplaceMode((v) => {
                                          const next = !v;
                                          if (!next) setSfClientSecret("");
                                          return next;
                                        });
                                      }}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                    >
                                      {sfSecretReplaceMode ? "Cancel" : "Replace secret"}
                                    </Button>
                                  ) : null}
                                </div>
                                <Input
                                  id="sf-client-secret"
                                  placeholder={
                                    (salesforceAppConfig as any)?.hasClientSecret && !sfSecretReplaceMode
                                      ? "•••••••• (secret saved — use Replace to update)"
                                      : "From your Connected App"
                                  }
                                  type="password"
                                  value={sfClientSecret}
                                  onChange={(e) => setSfClientSecret(e.target.value)}
                                  className="bg-background"
                                  autoComplete="off"
                                  disabled={Boolean(
                                    (salesforceAppConfig as any)?.hasClientSecret && !sfSecretReplaceMode
                                  )}
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
                                  Production or developer: login.salesforce.com · Sandbox: test.salesforce.com
                                </p>
                              </div>
                            </div>

                            {oauthHints?.salesforceDefaultsAvailable && !hasSalesforceDbConfig ? (
                              <p className="text-xs text-muted-foreground">
                                Default Inboundless credentials are available—connect above without filling this form, or
                                save your own to override for this workspace only.
                              </p>
                            ) : null}
                            {!salesforceOAuthReady ? (
                              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                                Enter the fields above or ask your administrator to enable the shared Salesforce
                                connection for this environment.
                              </p>
                            ) : null}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                    ) : null}
                  </Card>
                  </>
                )}

                {/* HubSpot */}
                {showHubspot && (
                  <Card className="overflow-hidden border-border/60 shadow-sm">
                    <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-4">
                        <div
                          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500/12"
                          aria-hidden
                        >
                          <SiHubspot className="size-7 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-lg">HubSpot</CardTitle>
                            {isHubspotConnected ? (
                              <Badge
                                variant="secondary"
                                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                              >
                                Connected
                              </Badge>
                            ) : null}
                          </div>
                          <CardDescription>Turn booked visitors into HubSpot contacts via OAuth.</CardDescription>
                          {isHubspotConnected ? (
                            <p className="text-xs text-muted-foreground">
                              Portal{" "}
                              <span className="font-medium text-foreground">{hubspotPortalLabel}</span>
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          disabled={!hubspotOAuthReady}
                          onClick={handleHubspotConnect}
                          size="sm"
                          title={!hubspotOAuthReady ? "Configure connection (see optional section below)" : undefined}
                          type="button"
                        >
                          {isHubspotConnected ? "Reconnect" : "Connect"}
                        </Button>
                        {isHubspotConnected ? (
                          <Button onClick={handleHubspotDisconnect} size="sm" type="button" variant="outline">
                            Disconnect
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>

                    {canConfigureHubspotByo ? (
                    <div className="border-t border-border/60 bg-muted/20 px-4 py-4">
                      <Collapsible
                        key={`hs-${String(oauthHints?.hubspotDefaultsAvailable)}-${String(hasHubspotDbConfig)}`}
                        defaultOpen={!hubspotByoCollapsedByDefault}
                      >
                        <CollapsibleTrigger
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left text-sm font-medium",
                            "hover:bg-muted/60 [&[data-state=open]]:border-border/60 [&[data-state=open]]:bg-muted/40"
                          )}
                          type="button"
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <Settings2 className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0">
                              {hubspotByoCollapsedByDefault ? "Use your own HubSpot OAuth app" : "HubSpot OAuth app IDs"}
                              <span className="ml-1.5 font-normal text-muted-foreground">
                                {hubspotByoCollapsedByDefault ? "(optional)" : ""}
                              </span>
                            </span>
                            {hasHubspotDbConfig ? (
                              <Badge variant="outline" className="ml-2 shrink-0 font-normal">
                                Saved for this org
                              </Badge>
                            ) : null}
                          </span>
                          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                          <div className="mt-3 space-y-4 rounded-lg border border-border/60 bg-background p-4 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-xs text-muted-foreground">
                                Register your app&apos;s callback URL in HubSpot for each environment (local and production)
                                so OAuth can return here securely.
                              </p>
                              <Button
                                size="sm"
                                onClick={handleSaveHubspotConfig}
                                disabled={!canSaveHsConfig || hsSaving}
                                type="button"
                                variant="secondary"
                              >
                                {hsSaving ? "Saving…" : "Save credentials"}
                              </Button>
                            </div>

                            <div className="grid gap-4">
                              <div className="grid gap-2">
                                <Label htmlFor="hs-client-id">Client ID</Label>
                                <Input
                                  id="hs-client-id"
                                  placeholder="From your HubSpot app"
                                  value={hsClientId}
                                  onChange={(e) => setHsClientId(e.target.value)}
                                  className="bg-background"
                                  autoComplete="off"
                                />
                              </div>

                              <div className="grid gap-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <Label htmlFor="hs-client-secret">Client Secret</Label>
                                    {(hubspotAppConfig as any)?.hasClientSecret && !hsSecretReplaceMode ? (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        Saved in Inboundless. The secret is never shown again—use{" "}
                                        <span className="font-medium text-foreground">Replace</span> to set a new one.
                                      </p>
                                    ) : null}
                                    {(hubspotAppConfig as any)?.hasClientSecret && hsSecretReplaceMode ? (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        Paste the new Client Secret from your HubSpot app, then save.
                                      </p>
                                    ) : null}
                                  </div>
                                  {(hubspotAppConfig as any)?.hasClientSecret ? (
                                    <Button
                                      className="shrink-0"
                                      onClick={() => {
                                        setHsSecretReplaceMode((v) => {
                                          const next = !v;
                                          if (!next) setHsClientSecret("");
                                          return next;
                                        });
                                      }}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                    >
                                      {hsSecretReplaceMode ? "Cancel" : "Replace secret"}
                                    </Button>
                                  ) : null}
                                </div>
                                <Input
                                  id="hs-client-secret"
                                  placeholder={
                                    (hubspotAppConfig as any)?.hasClientSecret && !hsSecretReplaceMode
                                      ? "•••••••• (secret saved — use Replace to update)"
                                      : "From your HubSpot app"
                                  }
                                  type="password"
                                  value={hsClientSecret}
                                  onChange={(e) => setHsClientSecret(e.target.value)}
                                  className="bg-background"
                                  autoComplete="off"
                                  disabled={Boolean((hubspotAppConfig as any)?.hasClientSecret && !hsSecretReplaceMode)}
                                />
                              </div>
                            </div>

                            {oauthHints?.hubspotDefaultsAvailable && !hasHubspotDbConfig ? (
                              <p className="text-xs text-muted-foreground">
                                Default Inboundless credentials are available—use Connect above, or save your own keys
                                to use a dedicated HubSpot app for this workspace.
                              </p>
                            ) : null}
                            {!hubspotOAuthReady ? (
                              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                                Enter the Client ID and Secret above, or ask your administrator to enable the shared
                                HubSpot connection for this environment.
                              </p>
                            ) : null}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                    ) : null}
                  </Card>
                )}

                {showVoice && (
                  <div ref={voiceSectionRef} id="voice" className="scroll-mt-28">
                    <div className="pt-2">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Voice
                      </h3>
                    </div>
                    <Card className="overflow-hidden border-border/60 shadow-sm">
                      <Collapsible open={voicePanelOpen} onOpenChange={setVoicePanelOpen}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 items-start gap-4">
                              <div
                                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/12"
                                aria-hidden
                              >
                                <Mic className="size-5 text-violet-600 dark:text-violet-400" />
                              </div>
                              <div className="min-w-0 space-y-1">
                                <CardTitle className="text-base">Voice</CardTitle>
                                <CardDescription>
                                  Vapi voice in the widget: Inboundless can provide shared keys, or Voice+ lets you
                                  bring your own. Then pick an assistant and optional display number.
                                </CardDescription>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <CollapsibleTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex size-9 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-xs transition hover:bg-muted/40 hover:text-foreground"
                                  aria-label="Show voice details"
                                >
                                  <ChevronDown
                                    className={cn("size-4 transition-transform", voicePanelOpen && "rotate-180")}
                                  />
                                </button>
                              </CollapsibleTrigger>
                            </div>
                          </div>
                        </CardHeader>
                        <CollapsibleContent>
                          <CardContent className="border-t border-border/60 bg-muted/10 pb-6 pt-5">
                            <VapiConnectionPanel canConfigureVoiceByo={canConfigureVoiceByo} />
                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  </div>
                )}
              </section>
            </>
          )}

          {/* Messaging (bottom) */}
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Messaging</h2>

            <Card className="overflow-hidden border-border/60 shadow-sm">
              <Collapsible defaultOpen={false}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/10 text-[#25D366]">
                        <svg className="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="text-base">WhatsApp</CardTitle>
                        <CardDescription>
                          Optional button in the chat header. Uses assigned rep WhatsApp when enabled, else your company
                          number.
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Switch checked={waEnabled} onCheckedChange={setWaEnabled} />
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex size-9 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-xs transition hover:bg-muted/40 hover:text-foreground"
                          aria-label="Show WhatsApp details"
                        >
                          <ChevronDown className="size-4" />
                        </button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                </CardHeader>

                <CollapsibleContent>
                  <CardContent className="border-t border-border/60 bg-muted/10 pb-6 pt-5">
                    <div className="grid gap-4">
                      <div className="rounded-lg border bg-background/60 px-4 py-3">
                        <div className="text-sm font-medium">Enable WhatsApp handoff</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Visitors can continue the conversation on WhatsApp (opens{" "}
                          <code className="rounded bg-muted px-1">wa.me</code>).
                        </div>
                      </div>

                      <div className="grid gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="wa-digits">Default company WhatsApp number</Label>
                          <Input
                            id="wa-digits"
                            value={waDigits}
                            onChange={(e) => setWaDigits(e.target.value)}
                            disabled={!waEnabled}
                            placeholder="+33 6 12 34 56 78"
                            className="bg-background"
                          />
                          <p className="text-xs text-muted-foreground">Include country code. We store digits only.</p>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-lg border bg-background/60 px-4 py-3">
                          <div className="space-y-0.5">
                            <div className="text-sm font-medium">Use assigned rep WhatsApp first</div>
                            <div className="text-xs text-muted-foreground">
                              If off, the chat always uses your company number even when a rep is assigned.
                            </div>
                          </div>
                          <Switch
                            checked={waUseRepFirst}
                            onCheckedChange={setWaUseRepFirst}
                            disabled={!waEnabled}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="wa-template">Optional first message (template)</Label>
                          <Textarea
                            id="wa-template"
                            value={waTemplate}
                            onChange={(e) => setWaTemplate(e.target.value)}
                            disabled={!waEnabled}
                            rows={3}
                            className="bg-background"
                            placeholder="Hi! I'm messaging from the website chat. Context: {pageLabel} — optional: {chatExcerpt}"
                          />
                          <p className="text-xs text-muted-foreground">
                            Placeholders: <code className="rounded bg-muted px-1">{"{pageLabel}"}</code>,{" "}
                            <code className="rounded bg-muted px-1">{"{pageUrl}"}</code>,{" "}
                            <code className="rounded bg-muted px-1">{"{chatExcerpt}"}</code>,{" "}
                            <code className="rounded bg-muted px-1">{"{locale}"}</code>.
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button onClick={handleSaveWhatsapp} disabled={waSaving} type="button">
                          {waSaving ? "Saving…" : "Save WhatsApp"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          </section>
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
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="space-y-1 border-b px-6 py-5 text-left">
          <DialogTitle className="text-xl font-semibold">Install the chat widget</DialogTitle>
          <DialogDescription className="text-base text-muted-foreground">
            Paste this snippet once—usually before the closing <span className="font-medium text-foreground">&lt;/body&gt;</span>{" "}
            tag or in your layout component.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="group relative rounded-xl border bg-muted/40">
            <pre className="max-h-[280px] overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all rounded-xl p-4 font-mono text-[13px] leading-relaxed text-foreground">
              {snippet}
            </pre>
            <Button
              className="absolute right-3 top-3 gap-1.5 shadow-sm"
              onClick={handleCopy}
              size="sm"
              type="button"
              variant="secondary"
            >
              <CopyIcon className="size-3.5" />
              Copy snippet
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Your organization id is embedded in this snippet—the same id appears under Technical details on the main
            page if you need it for support.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
