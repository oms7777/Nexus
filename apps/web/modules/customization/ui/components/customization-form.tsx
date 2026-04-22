"use client";

import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@workspace/backend/_generated/api";
import { Doc } from "@workspace/backend/_generated/dataModel";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import { Textarea } from "@workspace/ui/components/textarea";
import { Switch } from "@workspace/ui/components/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { useMutation, useAction, useQuery } from "convex/react";
import { SubmitHandler, useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import {
  widgetSettingsSchema,
  coerceHexForNativeColorInput,
  sanitizeHexColorString,
} from "../../schemas";

function firstNestedFormErrorMessage(errors: unknown): string | null {
  if (!errors || typeof errors !== "object") return null;
  for (const v of Object.values(errors as Record<string, unknown>)) {
    if (v && typeof v === "object" && "message" in v) {
      const m = (v as { message?: unknown }).message;
      if (typeof m === "string" && m.trim()) return m;
    }
    const inner = firstNestedFormErrorMessage(v);
    if (inner) return inner;
  }
  return null;
}
import { MessageCircle } from "lucide-react";
import PromosPanel from "./promos-panel";
import PageNudgesPanel from "./page-nudges-panel";

type WidgetSettings = Doc<"widgetSettings">;

interface CustomizationFormProps {
  initialData?: WidgetSettings | null;
}

type FormSchema = z.infer<typeof widgetSettingsSchema>;

export const CustomizationForm = ({ initialData }: CustomizationFormProps) => {
  const upsertWidgetSettings = useMutation(api.private.widgetSettings.upsert);
  const addFile = useAction(api.private.files.addFile);

  // ✅ entitlements (Starter => pas d’onglet promos)
  const entitlements =
    useQuery(api.public.entitlements.getEntitlements, {}) ?? null;

  const canUseAdvancedPromos = !!entitlements?.features?.canUseAdvancedPromos;

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<FormSchema>({
    resolver: zodResolver(widgetSettingsSchema) as any,
    defaultValues: {
      greetMessage: initialData?.greetMessage || "Hi! How can I help you today?",
      defaultSuggestions: {
        suggestion1: initialData?.defaultSuggestions.suggestion1 || "",
        suggestion2: initialData?.defaultSuggestions.suggestion2 || "",
        suggestion3: initialData?.defaultSuggestions.suggestion3 || "",
      },
      escalationSuggestionAfterMessages:
        (initialData as any)?.escalationSuggestionAfterMessages ?? 3,
      embedLayout: (initialData as any)?.embedLayout || "compact",
      widgetUiLanguage:
        (initialData as any)?.widgetUiLanguage === "fr" ? "fr" : "en",
      theme: {
        primaryColor: initialData?.theme?.primaryColor || "#a855f7",
        primaryTextColor: initialData?.theme?.primaryTextColor || "#ffffff",
        secondaryColor: initialData?.theme?.secondaryColor || "#ffffff",
        secondaryTextColor: initialData?.theme?.secondaryTextColor || "#0f172a",
        nudgeBackgroundColor:
          initialData?.theme?.nudgeBackgroundColor || "#ffffff",
        chatBubbleColor:
          initialData?.theme?.chatBubbleColor ||
          initialData?.theme?.primaryColor ||
          "#d946ef",
      },
      brandLogoUrl: initialData?.brandLogoUrl || "",
      privacyUrl: initialData?.privacyUrl?.trim() || "",
      consent: {
        enabled: initialData?.consent?.enabled ?? true,
        title:
          initialData?.consent?.title ||
          "Discover the right solution for your business project.",
        intro:
          initialData?.consent?.intro ||
          "Our team is available to chat to guide you through the options based on your needs!",
        body:
          initialData?.consent?.body ||
          "I hereby consent to processing of my personal data collected in the chat in accordance with the rules described",
        acceptLabel: initialData?.consent?.acceptLabel || "✓ Yes, I consent",
        version: initialData?.consent?.version || "v1.0",
        linkMode: initialData?.consent?.linkMode || "link",
        privacyUrl:
          initialData?.consent?.privacyUrl?.trim() ||
          initialData?.privacyUrl?.trim() ||
          "",
        modalContent: initialData?.consent?.modalContent || "",
      },
      whatsappHandoffEnabled: (initialData as any)?.whatsappHandoffEnabled ?? false,
      whatsappPhoneDigits: (initialData as any)?.whatsappPhoneDigits ?? "",
      whatsappPrefillTemplate: (initialData as any)?.whatsappPrefillTemplate ?? "",
      playbookPresetId:
        (initialData as any)?.playbookPresetId === "book_demo_qual_v1"
          ? "book_demo_qual_v1"
          : "off",
    },
  });

  const logoUrl = form.watch("brandLogoUrl");
  const themeWatch = form.watch("theme");

  const primaryColor = form.watch("theme.primaryColor") || "#a855f7";
  const primaryTextColor = form.watch("theme.primaryTextColor") || "#ffffff";
  const secondaryColor = form.watch("theme.secondaryColor") || "#ffffff";
  const secondaryTextColor =
    form.watch("theme.secondaryTextColor") || "#0f172a";
  const nudgeBackgroundColor =
    form.watch("theme.nudgeBackgroundColor") || "#ffffff";
  const chatBubbleColor = form.watch("theme.chatBubbleColor") || primaryColor;

  const greetMessage =
    form.watch("greetMessage") || "Hi! How can I help you today?";

  const handleLogoFile = async (file?: File) => {
    if (!file) return;

    try {
      setUploadingLogo(true);
      const bytes = await file.arrayBuffer();

      const res = await addFile({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes,
        category: "brand_logo",
      });

      const url = (res as any)?.url as string | undefined;

      if (!url) {
        toast.error("Upload failed (no URL returned)");
        return;
      }

      form.setValue("brandLogoUrl", url, {
        shouldDirty: true,
        shouldValidate: true,
      });

      toast.success("Logo uploaded");
    } catch (err) {
      console.error(err);
      toast.error("Upload failed");
    } finally {
      setUploadingLogo(false);
      if (logoFileInputRef.current) {
        logoFileInputRef.current.value = "";
      }
    }
  };

  const onSubmit: SubmitHandler<FormSchema> = async (values) => {
    try {
      const theme =
        values.theme && Object.values(values.theme).some(Boolean)
          ? values.theme
          : undefined;

      const waDigits = String(values.whatsappPhoneDigits ?? "").replace(/\D/g, "");

      await upsertWidgetSettings({
        greetMessage: values.greetMessage,
        defaultSuggestions: values.defaultSuggestions,
        escalationSuggestionAfterMessages:
          values.escalationSuggestionAfterMessages ?? 3,
        playbookPresetId: values.playbookPresetId ?? "off",
        teamAvatars: undefined,
        embedLayout: values.embedLayout,
        widgetUiLanguage: values.widgetUiLanguage,
        theme,
        brandLogoUrl: values.brandLogoUrl || undefined,
        privacyUrl: values.privacyUrl || undefined,
        whatsappHandoffEnabled: values.whatsappHandoffEnabled ?? false,
        whatsappPhoneDigits: values.whatsappHandoffEnabled ? waDigits : "",
        whatsappPrefillTemplate: values.whatsappPrefillTemplate?.trim() || undefined,
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
                  ? values.consent.privacyUrl?.trim() ||
                    (typeof values.privacyUrl === "string" ? values.privacyUrl.trim() : "") ||
                    undefined
                  : undefined,
              modalContent:
                values.consent.linkMode === "modal"
                  ? values.consent.modalContent?.trim() || undefined
                  : undefined,
            }
          : undefined,
      } as any);

      toast.success("Widget settings saved");
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong");
    }
  };

  const onError = (errors: unknown) => {
    console.error("RHF/Zod validation errors:", errors);
    const hint = firstNestedFormErrorMessage(errors);
    toast.error(
      hint
        ? `${hint} (see fields marked below.)`
        : "Validation error — check highlighted fields",
    );
  };

  const consentEnabled = form.watch("consent")?.enabled ?? true;
  const linkMode = form.watch("consent")?.linkMode ?? "link";
  const submitting = form.formState.isSubmitting;

  return (
    <Form {...(form as any)}>
      <form
        className="space-y-6"
        onSubmit={form.handleSubmit(onSubmit, onError)}
      >
        <Tabs defaultValue="branding" className="w-full">
          <TabsList className="mb-2 flex w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="chat">General chat</TabsTrigger>

            {/* ✅ Starter: hide completely */}
            {canUseAdvancedPromos ? (
              <TabsTrigger value="promos">Page-based Promos</TabsTrigger>
            ) : null}

            <TabsTrigger value="consent">Consent &amp; Privacy</TabsTrigger>
          </TabsList>

          {/* Branding (look & feel) */}
          <TabsContent value="branding" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Branding & Colors</CardTitle>
                <CardDescription>
                  Control how the chat bubble and promo nudge look on your site.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)]">
                  {/* LEFT */}
                  <div className="space-y-6">
                    {/* ✅ Logo upload only (URL hidden) */}
                    <FormField
                      control={form.control as any}
                      name="brandLogoUrl"
                      render={() => (
                        <FormItem className="space-y-3">
                          <FormLabel>Logo</FormLabel>

                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <p>Shown in the chat header and promo nudge.</p>
                              <p>
                                Upload a PNG/SVG — stored securely and reused across promos.
                              </p>
                            </div>

                            <div className="flex items-center gap-3">
                              {logoUrl ? (
                                <img
                                  src={logoUrl}
                                  alt="Logo preview"
                                  className="h-10 w-10 rounded-full border bg-white object-contain p-1"
                                />
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-white">
                                  <MessageCircle className="h-4 w-4 text-slate-500" />
                                </div>
                              )}

                              <input
                                ref={logoFileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) =>
                                  handleLogoFile(
                                    e.target.files?.[0] || undefined,
                                  )
                                }
                              />

                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={uploadingLogo}
                                onClick={() => logoFileInputRef.current?.click()}
                              >
                                {uploadingLogo
                                  ? "Uploading…"
                                  : logoUrl
                                    ? "Replace logo"
                                    : "Upload logo"}
                              </Button>

                              {logoUrl ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    form.setValue("brandLogoUrl", "", {
                                      shouldDirty: true,
                                      shouldValidate: true,
                                    })
                                  }
                                >
                                  Remove
                                </Button>
                              ) : null}
                            </div>
                          </div>

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Separator />

                    <FormField
                      control={form.control as any}
                      name="embedLayout"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Widget layout</FormLabel>
                          <FormControl>
                            <select
                              {...field}
                              value={field.value ?? "compact"}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value as "compact" | "full_width_bottom"
                                )
                              }
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <option value="compact">
                                Compact panel (floating on the side)
                              </option>
                              <option value="full_width_bottom">
                                Full-width bar at bottom of page
                              </option>
                            </select>
                          </FormControl>
                          <FormDescription>
                            Compact: small floating block. Full-width: chat spans the bottom of the page.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control as any}
                      name="widgetUiLanguage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Widget language</FormLabel>
                          <FormControl>
                            <select
                              {...field}
                              value={field.value ?? "en"}
                              onChange={(e) => field.onChange(e.target.value)}
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <option value="en">English</option>
                              <option value="fr">Français</option>
                            </select>
                          </FormControl>
                          <FormDescription>
                            Labels, buttons, and booking flow in the chat widget. The assistant still
                            replies in the language your visitors write in.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control as any}
                        name="theme.primaryColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Primary color</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="#a855f7"
                                  autoComplete="off"
                                  onBlur={(e) => {
                                    const n = sanitizeHexColorString(e.target.value);
                                    if (n !== e.target.value) field.onChange(n);
                                    field.onBlur();
                                  }}
                                />
                              </FormControl>
                              <input
                                type="color"
                                aria-label="Pick primary color"
                                value={coerceHexForNativeColorInput(field.value, "#a855f7")}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="h-9 w-9 cursor-pointer rounded border"
                              />
                            </div>
                            <FormDescription>
                              Used for primary CTA buttons (promo + chat accents).
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control as any}
                        name="theme.primaryTextColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Primary text color</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="#ffffff"
                                  autoComplete="off"
                                  onBlur={(e) => {
                                    const n = sanitizeHexColorString(e.target.value);
                                    if (n !== e.target.value) field.onChange(n);
                                    field.onBlur();
                                  }}
                                />
                              </FormControl>
                              <input
                                type="color"
                                aria-label="Pick primary text color"
                                value={coerceHexForNativeColorInput(field.value, "#ffffff")}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="h-9 w-9 cursor-pointer rounded border"
                              />
                            </div>
                            <FormDescription>
                              Text color for primary CTA buttons.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control as any}
                        name="theme.secondaryColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Secondary button background</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="#ffffff"
                                  autoComplete="off"
                                  onBlur={(e) => {
                                    const n = sanitizeHexColorString(e.target.value);
                                    if (n !== e.target.value) field.onChange(n);
                                    field.onBlur();
                                  }}
                                />
                              </FormControl>
                              <input
                                type="color"
                                aria-label="Pick secondary button background"
                                value={coerceHexForNativeColorInput(field.value, "#ffffff")}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="h-9 w-9 cursor-pointer rounded border"
                              />
                            </div>
                            <FormDescription>
                              Background color for secondary CTA buttons.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control as any}
                        name="theme.secondaryTextColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Secondary CTA text color</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="#0f172a"
                                  autoComplete="off"
                                  onBlur={(e) => {
                                    const n = sanitizeHexColorString(e.target.value);
                                    if (n !== e.target.value) field.onChange(n);
                                    field.onBlur();
                                  }}
                                />
                              </FormControl>
                              <input
                                type="color"
                                aria-label="Pick secondary CTA text color"
                                value={coerceHexForNativeColorInput(field.value, "#0f172a")}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="h-9 w-9 cursor-pointer rounded border"
                              />
                            </div>
                            <FormDescription>
                              Text color for secondary CTA buttons.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control as any}
                        name="theme.nudgeBackgroundColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nudge background</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="#ffffff"
                                  autoComplete="off"
                                  onBlur={(e) => {
                                    const n = sanitizeHexColorString(e.target.value);
                                    if (n !== e.target.value) field.onChange(n);
                                    field.onBlur();
                                  }}
                                />
                              </FormControl>
                              <input
                                type="color"
                                aria-label="Pick nudge background"
                                value={coerceHexForNativeColorInput(field.value, "#ffffff")}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="h-9 w-9 cursor-pointer rounded border"
                              />
                            </div>
                            <FormDescription>
                              Background of the promo nudge card.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control as any}
                        name="theme.chatBubbleColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Chat bubble color</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="#d946ef"
                                  autoComplete="off"
                                  onBlur={(e) => {
                                    const n = sanitizeHexColorString(e.target.value);
                                    if (n !== e.target.value) field.onChange(n);
                                    field.onBlur();
                                  }}
                                />
                              </FormControl>
                              <input
                                type="color"
                                aria-label="Pick chat bubble color"
                                value={coerceHexForNativeColorInput(field.value, "#d946ef")}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="h-9 w-9 cursor-pointer rounded border"
                              />
                            </div>
                            <FormDescription>
                              Color of the round chat button at the bottom of the page.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* RIGHT: widget preview */}
                  <div className="flex flex-col">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Widget preview
                    </div>

                    <div className="flex h-full items-end justify-center rounded-xl border bg-slate-50 px-4 pb-6 pt-4">
                      <div className="relative h-[420px] w-full max-w-[640px] overflow-hidden rounded-2xl border bg-white shadow-sm">
                        <div className="absolute bottom-4 right-4">
                          <div className="relative">
                            <div className="absolute bottom-[140px] right-[40px] z-20 w-[260px] translate-x-[-300px]">
                              <div
                                className="rounded-2xl border p-4 shadow-lg shadow-slate-200"
                                style={{ backgroundColor: nudgeBackgroundColor }}
                              >
                                <div className="flex items-center gap-3">
                                  {logoUrl ? (
                                    <img
                                      src={logoUrl}
                                      alt="Logo"
                                      className="h-9 w-9 rounded-full border bg-white object-contain p-1"
                                    />
                                  ) : (
                                    <div className="flex -space-x-1">
                                      <div className="h-7 w-7 rounded-full border border-white bg-slate-200" />
                                      <div className="h-7 w-7 rounded-full border border-white bg-slate-300" />
                                      <div className="h-7 w-7 rounded-full border border-white bg-slate-400" />
                                    </div>
                                  )}

                                  <div className="min-w-0 space-y-1">
                                    <div
                                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                                      style={{
                                        backgroundColor: `${primaryColor}1A`,
                                        color: primaryColor,
                                      }}
                                    >
                                      LIVE
                                    </div>
                                    <div className="truncate text-sm font-semibold text-slate-900">
                                      Get help fast or schedule time
                                    </div>
                                  </div>
                                </div>

                                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                                  Talk to the assistant now or book a 15-min demo.
                                </p>

                                <div className="mt-3 space-y-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-8 w-full justify-center text-sm"
                                    style={{
                                      backgroundColor: primaryColor,
                                      color: primaryTextColor,
                                      borderColor: primaryColor,
                                    }}
                                  >
                                    Chat with AI Assistant
                                  </Button>

                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 w-full justify-center text-sm"
                                    style={{
                                      backgroundColor: secondaryColor,
                                      color: secondaryTextColor,
                                      borderColor: primaryColor,
                                    }}
                                  >
                                    Book a meeting
                                  </Button>
                                </div>

                                <p className="mt-3 text-[10px] text-slate-400">
                                  Preview uses a fixed sample promo (colors only).
                                </p>
                              </div>
                            </div>

                            <div className="h-[320px] w-[340px] rounded-2xl border bg-white shadow-sm">
                              <div className="flex items-center justify-between border-b px-4 py-2">
                                <div className="flex items-center gap-2">
                                  {logoUrl ? (
                                    <img
                                      src={logoUrl}
                                      alt="Logo"
                                      className="h-7 w-7 rounded-full border bg-white object-contain p-1"
                                    />
                                  ) : (
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100">
                                      <MessageCircle className="h-4 w-4 text-slate-500" />
                                    </div>
                                  )}
                                  <span className="text-xs font-medium text-slate-800">
                                    Your assistant
                                  </span>
                                </div>
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                                  Live
                                </span>
                              </div>

                              <div className="space-y-2 px-4 py-3">
                                <div className="inline-flex max-w-[80%] rounded-2xl bg-slate-100 px-3 py-2 text-[11px] text-slate-700">
                                  {greetMessage}
                                </div>
                                <div className="flex justify-end">
                                  <div
                                    className="inline-flex max-w-[80%] rounded-2xl px-3 py-2 text-[11px]"
                                    style={{
                                      backgroundColor: primaryColor,
                                      color: primaryTextColor,
                                    }}
                                  >
                                    “Show me the pricing options”
                                  </div>
                                </div>
                              </div>

                              <div className="pointer-events-none absolute bottom-0 right-0">
                                <div className="absolute bottom-4 right-4 flex items-center gap-2">
                                  <div className="rounded-full bg-white/70 px-2 py-1 text-[10px] text-slate-600 shadow-sm">
                                    Chat bubble on your page
                                  </div>
                                  <div
                                    className="flex h-10 w-18 items-center justify-center rounded-full shadow-md"
                                    style={{ backgroundColor: chatBubbleColor }}
                                  >
                                    <MessageCircle
                                      className="h-5 w-5"
                                      style={{ color: primaryTextColor }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                            {/* /Chat window */}
                          </div>
                        </div>
                        {/* /Anchor group */}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Greeting, suggestions, escalation, WhatsApp — not visual branding */}
          <TabsContent value="chat" className="space-y-6">
            {/* ---------- General Chat Settings ---------- */}
            <Card>
              <CardHeader>
                <CardTitle>General Chat Settings</CardTitle>
                <CardDescription>
                  Configure basic chat widget behaviour and messages.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control as any}
                  name="greetMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Greeting Message</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Welcome message shown when chat opens"
                          rows={3}
                        />
                      </FormControl>
                      <FormDescription>
                        The first message customers see when they open the chat
                        (hors flow booking).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="space-y-4">
                  <div>
                    <h3 className="mb-4 text-sm">Default suggestions</h3>
                    <p className="mb-4 text-sm text-muted-foreground">
                      Quick reply suggestions shown to customers to help guide
                      the conversation.
                    </p>
                    <div className="space-y-4">
                      <FormField
                        control={form.control as any}
                        name="defaultSuggestions.suggestion1"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Suggestion 1</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="e.g., How do I get started"
                              />
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
                              <Input
                                {...field}
                                placeholder="e.g., What are your pricing plans?"
                              />
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
                              <Input
                                {...field}
                                placeholder="e.g., I need help with my account"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <FormField
                  control={form.control as any}
                  name="escalationSuggestionAfterMessages"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Show &quot;Talk to someone&quot; / &quot;Continue to chat&quot; after</FormLabel>
                      <FormControl>
                        <select
                          value={field.value ?? 3}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                        >
                          <option value={0}>Never</option>
                          <option value={2}>2 AI replies</option>
                          <option value={3}>3 AI replies</option>
                          <option value={4}>4 AI replies</option>
                          <option value={5}>5 AI replies</option>
                        </select>
                      </FormControl>
                      <FormDescription>
                        After this many assistant messages, the visitor sees
                        options to talk to a human or continue chatting with the
                        AI.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Guided playbook</CardTitle>
                <CardDescription>
                  Optional guided steps (chips) before free-form AI + knowledge base. Per-page routing next (same idea
                  as {canUseAdvancedPromos ? "promos" : "page nudges"}).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control as any}
                  name="playbookPresetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preset</FormLabel>
                      <FormControl>
                        <select
                          value={field.value ?? "off"}
                          onChange={(e) =>
                            field.onChange(e.target.value as "off" | "book_demo_qual_v1")
                          }
                          className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                        >
                          <option value="off">Off — standard chat (suggestions + AI + knowledge base)</option>
                          <option value="book_demo_qual_v1">
                            Book a demo — qualification (needs / wants / role / next step → handoff)
                          </option>
                        </select>
                      </FormControl>
                      <FormDescription>
                        Saves to your organization. When “Book a demo — qualification” is selected, visitors see a
                        short guided questionnaire in the embedded widget before free chat.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Book a demo — qualification</p>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    <li>Fixed questions and chip answers (deterministic, CRM-friendly).</li>
                    <li>Ends with a clear handoff (e.g. calendar) separate from default greeting suggestions.</li>
                    <li>Escalation “Talk to someone” still applies after AI replies once the visitor is in free chat.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>WhatsApp handoff</CardTitle>
                <CardDescription>
                  Show a WhatsApp button in the chat header. Opens{" "}
                  <code className="rounded bg-muted px-1">wa.me</code> with a
                  pre-filled message — no Meta developer app or API key required.
                  Set a default org number here; each rep can add their own number
                  under <strong>Account</strong> — when a rep is assigned (same
                  routing as booking), their WhatsApp is used if set.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control as any}
                  name="whatsappHandoffEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Enable WhatsApp button</FormLabel>
                        <FormDescription>
                          Visitors can continue the conversation in WhatsApp on their phone.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control as any}
                  name="whatsappPhoneDigits"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WhatsApp number</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="tel"
                          placeholder="+33 6 12 34 56 78"
                          autoComplete="off"
                        />
                      </FormControl>
                      <FormDescription>
                        Include country code. Saved as digits only for{" "}
                        <code className="rounded bg-muted px-1">wa.me</code>.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control as any}
                  name="whatsappPrefillTemplate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Optional first message (template)</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={3}
                          placeholder="Hi! I'm messaging from the website chat. Context: {pageLabel} — optional: {chatExcerpt}"
                        />
                      </FormControl>
                      <FormDescription>
                        Placeholders:{" "}
                        <code className="rounded bg-muted px-1">{"{pageLabel}"}</code> (visitor-friendly
                        page — no raw widget URL),{" "}
                        <code className="rounded bg-muted px-1">{"{pageUrl}"}</code> (same as{" "}
                        <code className="rounded bg-muted px-1">pageLabel</code>),{" "}
                        <code className="rounded bg-muted px-1">{"{chatExcerpt}"}</code>,{" "}
                        <code className="rounded bg-muted px-1">{"{locale}"}</code>. If empty, a default
                        English/French line is used from widget language.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* 1.5️⃣ PAGE-BASED NUDGES (Starter only) */}
            {!canUseAdvancedPromos ? <PageNudgesPanel /> : null}
          </TabsContent>

          {/* 2️⃣ PAGE-BASED PROMOS (Growth/Enterprise only) */}
          {canUseAdvancedPromos ? (
            <TabsContent value="promos" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Page-based Promos</CardTitle>
                  <CardDescription>
                    Configure smart nudges shown above the chat bubble based on
                    page URL and UTM parameters.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PromosPanel
                    theme={themeWatch ?? undefined}
                    brandLogoUrl={logoUrl || undefined}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          ) : null}

          {/* 3️⃣ CONSENT & PRIVACY */}
          <TabsContent value="consent" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Consent Block</CardTitle>
                <CardDescription>
                  Shown when user starts a booking flow.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control as any}
                  name="consent.enabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <FormLabel>Enable consent card</FormLabel>
                      <FormControl>
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                        />
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
                          <Input
                            {...field}
                            placeholder="v1.0"
                            disabled={!consentEnabled}
                          />
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

                  <FormField
                    control={form.control as any}
                    name="consent.linkMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>“here” opens</FormLabel>
                        <FormControl>
                          <select
                            {...field}
                            className="h-9 w-full rounded-md border px-2"
                            disabled={!consentEnabled}
                          >
                            <option value="link">External page</option>
                            <option value="modal">Inline text modal</option>
                          </select>
                        </FormControl>
                        <FormDescription>
                          Choose what happens when clicking “here”.
                        </FormDescription>
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
                            <Input
                              {...field}
                              placeholder="https://yourdomain.com/privacy"
                              disabled={!consentEnabled}
                            />
                          </FormControl>
                          <FormDescription>
                            Required when consent is on and “here” opens External page. Use https://
                          </FormDescription>
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
                          <FormLabel>
                            Modal text (shown when clicking “here”)
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              rows={6}
                              {...field}
                              placeholder="Paste your GDPR/consent text..."
                              disabled={!consentEnabled}
                            />
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
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button disabled={submitting} type="submit">
            {submitting ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </form>
    </Form>
  );
};
