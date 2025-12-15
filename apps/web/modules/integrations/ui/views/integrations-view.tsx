// apps/web/modules/integrations/ui/views/integrations-view.tsx
"use client";

import { useOrganization } from "@clerk/nextjs";
import Image from "next/image";
import { useMemo, useState } from "react";
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

// 👇 Convex
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

export const IntegrationsView = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSnippet, setSelectedSnippet] = useState("");
  const { organization } = useOrganization();

  // 🔍 Slack integration status
  const slackIntegration = useQuery(
    api.integrations.getSlackIntegration,
    organization ? { organizationId: organization.id } : ("skip" as any)
  );

  // 🔍 Salesforce integration status
  const salesforceIntegration = useQuery(
    api.integrations.getSalesforceIntegration,
    organization ? { organizationId: organization.id } : ("skip" as any)
  );

  const { isSlackConnected, slackTeamLabel, slackChannelLabel } = useMemo(() => {
    if (!slackIntegration) {
      return {
        isSlackConnected: false,
        slackTeamLabel: "",
        slackChannelLabel: "",
      };
    }

    const team = slackIntegration.teamName || "Slack workspace";
    const rawChannel = slackIntegration.defaultChannel || "#general";
    const normalizedChannel = rawChannel.startsWith("#")
      ? rawChannel
      : `#${rawChannel}`;

    return {
      isSlackConnected: true,
      slackTeamLabel: team,
      slackChannelLabel: normalizedChannel,
    };
  }, [slackIntegration]);

  const { isSalesforceConnected, salesforceInstanceLabel } = useMemo(() => {
    if (!salesforceIntegration) {
      return { isSalesforceConnected: false, salesforceInstanceLabel: "" };
    }

    // ex: https://orgfarm-xxx.my.salesforce.com -> orgfarm-xxx
    const host = (() => {
      try {
        return new URL(salesforceIntegration.instanceUrl).host;
      } catch {
        return salesforceIntegration.instanceUrl;
      }
    })();

    return {
      isSalesforceConnected: true,
      salesforceInstanceLabel: host,
    };
  }, [salesforceIntegration]);

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
    if (!organization) {
      toast.error("Organization ID not found");
      return;
    }
    window.location.href = "/api/integrations/slack/start";
  };

  const handleSalesforceConnect = () => {
    if (!organization) {
      toast.error("Organization ID not found");
      return;
    }
    window.location.href = "/api/integrations/salesforce/start";
  };

  const ConnectedBadge = ({ label = "Connected" }: { label?: string }) => (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      {label}
    </span>
  );

  return (
    <>
      <IntegrationsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        snippet={selectedSnippet}
      />

      <div className="flex min-h-screen flex-col bg-muted p-8">
        <div className="mx-auto w-full max-w-screen-md">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-2xl md:text-4xl">Setup & Integrations</h1>
            <p className="text-muted-foreground">
              Connect your tools and add the widget to your website.
            </p>
          </div>

          {/* Organization ID */}
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

          {/* Slack integration */}
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
                    Connected to{" "}
                    <span className="font-medium">{slackTeamLabel}</span> &middot;{" "}
                    Notifications sent to{" "}
                    <span className="font-mono">{slackChannelLabel}</span>.
                  </p>
                )}
              </div>

              <Button onClick={handleSlackConnect} size="sm" variant="default">
                {isSlackConnected ? "Reconnect Slack" : "Connect Slack"}
              </Button>
            </div>
          </div>

          {/* Salesforce integration (NEW) */}
          <div className="mt-4 space-y-3 rounded-lg border bg-background p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label className="text-lg">Salesforce</Label>
                  {isSalesforceConnected && <ConnectedBadge />}
                </div>

                <p className="text-sm text-muted-foreground">
                  Automatically create leads and meetings in Salesforce.
                </p>

                {isSalesforceConnected && (
                  <p className="text-xs text-muted-foreground">
                    Connected to{" "}
                    <span className="font-mono">{salesforceInstanceLabel}</span>.
                  </p>
                )}
              </div>

              <Button
                onClick={handleSalesforceConnect}
                size="sm"
                variant="default"
              >
                {isSalesforceConnected ? "Reconnect Salesforce" : "Connect Salesforce"}
              </Button>
            </div>
          </div>

          <Separator className="my-8" />

          {/* Widget embed snippets */}
          <div className="space-y-6">
            <div className="space-y-1">
              <Label className="text-lg">Website widget</Label>
              <p className="text-sm text-muted-foreground">
                Add the following code to your website to enable the chatbox.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {INTEGRATIONS.map((integration) => (
                <button
                  key={integration.id}
                  onClick={() => handleIntegrationClick(integration.id)}
                  type="button"
                  className="flex items-center gap-4 rounded-lg border bg-background p-4 hover:bg-accent"
                >
                  <Image
                    alt={integration.title}
                    height={32}
                    src={integration.icon}
                    width={32}
                  />
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
          <DialogDescription>
            Follow these steps to add the chatbox to your website.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <div className="rounded-md bg-accent p-2 text-sm">
              1. Copy the following code
            </div>
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
            <div className="rounded-md bg-accent p-2 text-sm">
              2. Add the code in your page
            </div>
            <p>
              Paste the chatbox code above in your page. You can add it in the HTML head
              section.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
