"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { toast } from "sonner";

import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Label } from "@workspace/ui/components/label";

import {
  BotIcon,
  PhoneIcon,
  SettingsIcon,
  UnplugIcon,
} from "lucide-react";

import { VapiPhoneNumbersTab } from "./vapi-phone-numbers-tab";
import { VapiAssistantsTab } from "./vapi-assistants-tab";
import {
  useVapiAssistants,
  useVapiPhoneNumbers,
} from "../../hooks/use-vapi-data";

interface VapiConnectedViewProps {
  onDisconnect: () => void;
  /** Hide disconnect when using Inboundless shared Vapi keys (no org-owned plugin). */
  showDisconnect?: boolean;
}

export const VapiConnectedView = ({
  onDisconnect,
  showDisconnect = true,
}: VapiConnectedViewProps) => {
  const [activeTab, setActiveTab] = useState("phone-numbers");

  const widgetSettings = useQuery(api.private.widgetSettings.getOne);
  const upsertWidgetSettings = useMutation(api.private.widgetSettings.upsert);

  const { data: assistants = [], isLoading: assistantsLoading } =
    useVapiAssistants();
  const { data: phoneNumbers = [], isLoading: phoneNumbersLoading } =
    useVapiPhoneNumbers();

  const [selectedAssistantId, setSelectedAssistantId] = useState("none");
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState("none");
  const [saving, setSaving] = useState(false);

  // hydrate selects from current widget settings
  useEffect(() => {
    const currentAssistant = widgetSettings?.vapiSettings?.assistantId;
    const currentPhoneNumber = widgetSettings?.vapiSettings?.phoneNumber;

    setSelectedAssistantId(currentAssistant || "none");
    setSelectedPhoneNumberId(currentPhoneNumber || "none");
  }, [widgetSettings?.vapiSettings?.assistantId, widgetSettings?.vapiSettings?.phoneNumber]);

  const handleSaveVoiceSettings = async () => {
    try {
      setSaving(true);

      const vapiSettings: { assistantId?: string; phoneNumber?: string } = {};

      if (selectedAssistantId !== "none") {
        vapiSettings.assistantId = selectedAssistantId;
      }
      if (selectedPhoneNumberId !== "none") {
        vapiSettings.phoneNumber = selectedPhoneNumberId;
      }

      await upsertWidgetSettings({ vapiSettings } as any);

      toast.success("Voice assistant settings saved");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save voice assistant settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top: integration card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Image
                alt="Vapi"
                className="rounded-lg object-contain"
                height={48}
                width={48}
                src="/vapi.jpg"
              />
              <div>
                <CardTitle>Vapi Integration</CardTitle>
                <CardDescription>
                  Manage your phone numbers and AI assistants
                </CardDescription>
              </div>
            </div>

            {showDisconnect ? (
              <Button onClick={onDisconnect} size="sm" variant="destructive">
                <UnplugIcon className="mr-1 h-4 w-4" />
                Disconnect
              </Button>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      {/* Voice assistant settings – now lives here, not in customization */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-lg border bg-muted">
                <SettingsIcon className="size-6 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>Voice Assistant Settings</CardTitle>
                <CardDescription>
                  Configure voice calling features powered by Vapi
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Assistant select */}
            <div className="space-y-2">
              <Label>Voice Assistant</Label>
              <Select
                value={selectedAssistantId}
                onValueChange={setSelectedAssistantId}
                disabled={assistantsLoading || assistants.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose assistant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {assistants.map((assistant: any) => (
                    <SelectItem key={assistant.id} value={assistant.id}>
                      {assistant.name || "Unnamed"}{" "}
                      {assistant.model?.model
                        ? `- ${assistant.model.model}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The Vapi assistant to use for voice calls.
              </p>
            </div>

            {/* Phone number select */}
            <div className="space-y-2">
              <Label>Display Phone Number</Label>
              <Select
                value={selectedPhoneNumberId}
                onValueChange={setSelectedPhoneNumberId}
                disabled={phoneNumbersLoading || phoneNumbers.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose number" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {phoneNumbers.map((phone: any) => (
                    <SelectItem key={phone.id} value={phone.id}>
                      {phone.number || "Not configured"}{" "}
                      {phone.name ? `- ${phone.name}` : "- Unnamed"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Phone number to display in the widget.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSaveVoiceSettings}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save voice settings"}
            </Button>
          </div>
        </CardContent>
      </Card>


      {/* Tabs: infra view (numbers + assistants lists) */}
      <div className="overflow-hidden rounded-lg border bg-background">
        <Tabs
          className="gap-0"
          defaultValue="phone-numbers"
          onValueChange={setActiveTab}
          value={activeTab}
        >
          <TabsList className="grid h-12 w-full grid-cols-2 p-0">
            <TabsTrigger className="h-full rounded-none" value="phone-numbers">
              <PhoneIcon className="mr-1 h-4 w-4" />
              Phone Numbers
            </TabsTrigger>
            <TabsTrigger className="h-full rounded-none" value="assistants">
              <BotIcon className="mr-1 h-4 w-4" />
              AI Assistants
            </TabsTrigger>
          </TabsList>
          <TabsContent value="phone-numbers">
            <VapiPhoneNumbersTab />
          </TabsContent>
          <TabsContent value="assistants">
            <VapiAssistantsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
