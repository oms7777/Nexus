"use client";

import {
  ChevronDown,
  GlobeIcon,
  PhoneCallIcon,
  PhoneIcon,
  Settings2,
  WorkflowIcon,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@workspace/backend/_generated/api";
import { type Feature, PluginCard } from "../components/plugin-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { VapiConnectedView } from "../components/vapi-connected-view";
import { cn } from "@workspace/ui/lib/utils";
import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";

const vapiFeatures: Feature[] = [
  {
    icon: GlobeIcon,
    label: "Web voice calls",
    description: "Voice chat directly in your app",
  },
  {
    icon: PhoneIcon,
    label: "Phone numbers",
    description: "Get dedicated business lines",
  },
  {
    icon: PhoneCallIcon,
    label: "Outbound calls",
    description: "Automated customer outreach",
  },
  {
    icon: WorkflowIcon,
    label: "Workflows",
    description: "Custom conversation flows",
  },
];

const formSchema = z.object({
  publicApiKey: z.string().min(1, { message: "Public API key is required" }),
  privateApiKey: z.string().min(1, { message: "Private API key is required" }),
});

const VapiPluginForm = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
}) => {
  const upsertSecret = useMutation(api.private.secrets.upsert);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      publicApiKey: "",
      privateApiKey: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      await upsertSecret({
        service: "vapi",
        value: {
          publicApiKey: values.publicApiKey,
          privateApiKey: values.privateApiKey,
        },
      });
      setOpen(false);
      toast.success("Vapi connected");
      form.reset();
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong");
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your Vapi API keys</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Keys are encrypted (AWS Secrets Manager). Use only if your plan includes Voice+ (bring your own Vapi).
        </DialogDescription>
        <Form {...(form as any)}>
          <form className="flex flex-col gap-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control as any}
              name="publicApiKey"
              render={({ field }) => (
                <FormItem>
                  <Label>Public API key</Label>
                  <FormControl>
                    <Input {...field} placeholder="Public key from Vapi" type="text" autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control as any}
              name="privateApiKey"
              render={({ field }) => (
                <FormItem>
                  <Label>Private API key</Label>
                  <FormControl>
                    <Input {...field} placeholder="Private key from Vapi" type="password" autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button disabled={form.formState.isSubmitting} type="submit">
                {form.formState.isSubmitting ? "Saving…" : "Save keys"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

const VapiPluginRemoveForm = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
}) => {
  const removePlugin = useMutation(api.private.plugins.remove);

  const onSubmit = async () => {
    try {
      await removePlugin({
        service: "vapi",
      });
      setOpen(false);
      toast.success("Removed your Vapi keys — shared defaults apply if configured.");
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong");
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove your Vapi keys</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          The widget will use Inboundless shared Vapi keys for this workspace (if enabled on the server).
        </DialogDescription>
        <DialogFooter>
          <Button onClick={onSubmit} variant="destructive">
            Remove keys
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export type VapiConnectionPanelProps = {
  /** Subscription flag: Voice+ — show BYO keys section (optional overrides). */
  canConfigureVoiceByo: boolean;
};

/**
 * Voice / Vapi — same product pattern as HubSpot/Salesforce:
 * shared Inboundless keys (env) + optional BYO when `canConfigureVoiceByo`.
 */
export const VapiConnectionPanel = ({ canConfigureVoiceByo }: VapiConnectionPanelProps) => {
  const vapiPlugin = useQuery(api.private.plugins.getOne, { service: "vapi" });
  const oauthHints = useQuery(api.integrations.getInboundlessOAuthEnvHints, {});

  const [connectOpen, setConnectOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const loading = vapiPlugin === undefined || oauthHints === undefined;
  const defaultsAvailable = !!oauthHints?.vapiDefaultsAvailable;
  const hasPlugin = !!vapiPlugin;
  const voiceInfraReady = hasPlugin || defaultsAvailable;

  const voiceByoCollapsedByDefault =
    defaultsAvailable && !hasPlugin && voiceInfraReady && canConfigureVoiceByo;

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading voice settings…</p>;
  }

  if (!voiceInfraReady && !canConfigureVoiceByo) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
        Voice is included in your plan but not provisioned yet. Ask your administrator to set Inboundless Vapi keys on
        the server, or enable Voice+ on this organization for self-serve keys.
      </p>
    );
  }

  if (!voiceInfraReady && canConfigureVoiceByo) {
    return (
      <>
        <VapiPluginForm open={connectOpen} setOpen={setConnectOpen} />
        <VapiPluginRemoveForm open={removeOpen} setOpen={setRemoveOpen} />
        <p className="mb-4 text-sm text-muted-foreground">
          No shared Vapi configuration is available for this environment. Add your Vapi public and private API keys.
        </p>
        <PluginCard
          serviceImage="/vapi.jpg"
          serviceName="Vapi"
          features={vapiFeatures}
          isDisabled={false}
          onSubmit={() => setConnectOpen(true)}
        />
      </>
    );
  }

  return (
    <>
      <VapiPluginForm open={connectOpen} setOpen={setConnectOpen} />
      <VapiPluginRemoveForm open={removeOpen} setOpen={setRemoveOpen} />

      {defaultsAvailable && !hasPlugin ? (
        <div className="mb-4 space-y-2 text-sm text-muted-foreground">
          <p>
            Inboundless shared Vapi keys are active — pick an assistant and optional display number below. Voice+ lets
            you override with your own Vapi account.
          </p>
        </div>
      ) : null}

      <VapiConnectedView
        onDisconnect={() => setRemoveOpen(true)}
        showDisconnect={hasPlugin}
      />

      {canConfigureVoiceByo ? (
        <div className="mt-6 border-t border-border/60 pt-4">
          <Collapsible
            key={`vapi-byo-${String(defaultsAvailable)}-${String(hasPlugin)}`}
            defaultOpen={!voiceByoCollapsedByDefault}
          >
            <CollapsibleTrigger
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left text-sm font-medium",
                "hover:bg-muted/60 [&[data-state=open]]:border-border/60 [&[data-state=open]]:bg-muted/40"
              )}
              type="button"
            >
              <span className="flex flex-wrap items-center gap-2">
                <Settings2 className="size-4 shrink-0 text-muted-foreground" />
                <span>
                  Use your own Vapi API keys
                  {voiceByoCollapsedByDefault ? (
                    <span className="ml-1.5 font-normal text-muted-foreground">(optional)</span>
                  ) : null}
                </span>
                {hasPlugin ? (
                  <Badge variant="outline" className="font-normal">
                    Your keys saved
                  </Badge>
                ) : null}
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
              <div className="mt-3 space-y-3 rounded-lg border border-border/60 bg-background p-4 text-sm shadow-sm">
                <p className="text-xs text-muted-foreground">
                  Override shared keys with your Vapi dashboard (API keys page). Restrict your public key to your domains
                  in Vapi for production.
                </p>
                {hasPlugin ? (
                  <Button onClick={() => setRemoveOpen(true)} size="sm" type="button" variant="outline">
                    Remove your keys (use shared defaults)
                  </Button>
                ) : (
                  <Button onClick={() => setConnectOpen(true)} size="sm" type="button" variant="secondary">
                    Add your Vapi keys
                  </Button>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      ) : null}
    </>
  );
};

/** Full-page wrapper — `/plugins/vapi` redirects to Integrations. */
export const VapiView = () => {
  const ent = useEntitlements();
  if (ent.isLoading) return null;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background via-background to-muted/40">
      <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-10 md:px-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Voice Assistant</h1>
          <p className="text-muted-foreground">
            Manage Vapi from <span className="font-medium text-foreground">Integrations</span> on your account.
          </p>
        </header>

        <VapiConnectionPanel canConfigureVoiceByo={!!ent.features?.canConfigureVoiceByo} />
      </div>
    </div>
  );
};
