import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@workspace/backend/_generated/api";
import { Doc } from "@workspace/backend/_generated/dataModel";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import { Textarea } from "@workspace/ui/components/textarea";
import { Switch } from "@workspace/ui/components/switch";
import { useMutation } from "convex/react";
import { SubmitHandler, useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import { VapiFormFields } from "./vapi-form-fields";
import { widgetSettingsSchema } from "../../schemas";

type WidgetSettings = Doc<"widgetSettings">;

interface CustomizationFormProps {
  initialData?: WidgetSettings | null;
  hasVapiPlugin: boolean;
}

type FormSchema = z.infer<typeof widgetSettingsSchema>;

export const CustomizationForm = ({ initialData, hasVapiPlugin }: CustomizationFormProps) => {
  const upsertWidgetSettings = useMutation(api.private.widgetSettings.upsert);

  const form = useForm<FormSchema>({
    // Cast to avoid RHF duplicate type issue in monorepo
    resolver: zodResolver(widgetSettingsSchema) as any,
    defaultValues: {
      greetMessage: initialData?.greetMessage || "Hi! How can I help you today?",
      defaultSuggestions: {
        suggestion1: initialData?.defaultSuggestions.suggestion1 || "",
        suggestion2: initialData?.defaultSuggestions.suggestion2 || "",
        suggestion3: initialData?.defaultSuggestions.suggestion3 || "",
      },
      vapiSettings: {
        assistantId: initialData?.vapiSettings.assistantId || "",
        phoneNumber: initialData?.vapiSettings.phoneNumber || "",
      },

      // keep (hidden) for backward compat; not shown in the form
      privacyUrl: initialData?.privacyUrl || "",

      consent: {
        enabled: initialData?.consent?.enabled ?? true,
        title: initialData?.consent?.title || "Discover the right solution for your business project.",
        intro: initialData?.consent?.intro || "Our team is available to chat to guide you through the options based on your needs!",
        body:
          initialData?.consent?.body ||
          "I hereby consent to processing of my personal data collected in the chat in accordance with the rules described",
        acceptLabel: initialData?.consent?.acceptLabel || "✓ Yes, I consent",
        version: initialData?.consent?.version || "v1.0",

        // NEW
        linkMode: initialData?.consent?.linkMode || "link",
        privacyUrl: initialData?.consent?.privacyUrl || "",
        modalContent:
          initialData?.consent?.modalContent ||
          "",
      },
    },
  });

  const onSubmit: SubmitHandler<FormSchema> = async (values) => {
    try {
      const vapiSettings: WidgetSettings["vapiSettings"] = {
        assistantId: values.vapiSettings.assistantId || "",
        phoneNumber: values.vapiSettings.phoneNumber || "",
      };

      await upsertWidgetSettings({
        greetMessage: values.greetMessage,
        defaultSuggestions: values.defaultSuggestions,
        vapiSettings,

        // keep passing for backward compat (widget may still read it)
        privacyUrl: values.privacyUrl || undefined,

        consent: values.consent
          ? {
              enabled: !!values.consent.enabled,
              title: values.consent.title?.trim() || undefined,
              intro: values.consent.intro?.trim() || undefined,
              body: values.consent.body?.trim() || undefined,
              acceptLabel: values.consent.acceptLabel?.trim() || undefined,
              version: values.consent.version?.trim() || undefined,

              linkMode: values.consent.linkMode,
              privacyUrl:
                values.consent.linkMode === "link"
                  ? values.consent.privacyUrl?.trim() || undefined
                  : undefined,
              modalContent:
                values.consent.linkMode === "modal"
                  ? values.consent.modalContent?.trim() || undefined
                  : undefined,
            }
          : undefined,
      });

      toast.success("Widget settings saved");
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong");
    }
  };

  const consentEnabled = form.watch("consent")?.enabled ?? true;
  const linkMode = form.watch("consent")?.linkMode ?? "link";

  return (
    <Form {...(form as any)}>
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        {/* General */}
        <Card>
          <CardHeader>
            <CardTitle>General Chat Settings</CardTitle>
            <CardDescription>Configure basic chat widget behaviour and messages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control as any}
              name="greetMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Greeting Message</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Welcome message shown when chat opens" rows={3} />
                  </FormControl>
                  <FormDescription>
                    The first message customers see when they open the chat (hors flow booking).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Removed the privacyUrl field from General section */}
            <Separator />

            <div className="space-y-4">
              <div>
                <h3 className="mb-4 text-sm">Default suggestions</h3>
                <p className="mb-4 text-muted-foreground text-sm">
                  Quick reply suggestions shown to customers to help guide the conversation
                </p>

                <div className="space-y-4">
                  <FormField
                    control={form.control as any}
                    name="defaultSuggestions.suggestion1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Suggestion 1</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., How do I get started" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control as any}
                    name="defaultSuggestions.suggestion2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Suggestion 2</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., What are your pricing plans?" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control as any}
                    name="defaultSuggestions.suggestion3"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Suggestion 3</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., I need help with my account" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Consent block */}
        <Card>
          <CardHeader>
            <CardTitle>Consent Block</CardTitle>
            <CardDescription>Shown when user starts a booking flow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control as any}
              name="consent.enabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <FormLabel>Enable consent card</FormLabel>
                  <FormControl>
                    <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control as any}
                name="consent.title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={!consentEnabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as any}
                name="consent.version"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Version</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="v1.0" disabled={!consentEnabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control as any}
                name="consent.intro"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Intro</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} disabled={!consentEnabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as any}
                name="consent.body"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Body (before the “here” link)</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} disabled={!consentEnabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* NEW: how “here” behaves */}
              <FormField
                control={form.control as any}
                name="consent.linkMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>“here” opens</FormLabel>
                    <FormControl>
                      <select {...field} className="h-9 w-full rounded-md border px-2" disabled={!consentEnabled}>
                        <option value="link">External page</option>
                        <option value="modal">Inline text modal</option>
                      </select>
                    </FormControl>
                    <FormDescription>Choose what happens when clicking “here”.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {linkMode === "link" ? (
                <FormField
                  control={form.control as any}
                  name="consent.privacyUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Privacy URL</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="https://yourdomain.com/privacy" disabled={!consentEnabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control as any}
                  name="consent.modalContent"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Modal text (shown when clicking “here”)</FormLabel>
                      <FormControl>
                        <Textarea rows={6} {...field} placeholder="Paste your GDPR/consent text..." disabled={!consentEnabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control as any}
                name="consent.acceptLabel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Accept button</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={!consentEnabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {hasVapiPlugin && (
          <Card>
            <CardHeader>
              <CardTitle>Voice Assistant Settings</CardTitle>
              <CardDescription>Configure voice calling features powered by Vapi</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <VapiFormFields form={form as any} />
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end">
          <Button disabled={form.formState.isSubmitting} type="submit">
            Save Settings
          </Button>
        </div>
      </form>
    </Form>
  );
};
