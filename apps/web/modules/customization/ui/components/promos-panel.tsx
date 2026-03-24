"use client";

import { useState } from "react";
import { useForm, SubmitHandler, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { Separator } from "@workspace/ui/components/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@workspace/ui/components/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { toast } from "sonner";

const PromoSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  active: z.boolean(),
  showNudge: z.boolean().optional(),

  // ✅ simplified targeting
  pathPrefix: z.string().optional(),
  pathMode: z.enum(["prefix", "exact"]).optional(),

  title: z.string().min(1),
  body: z.string().min(1),
  badgeText: z.string().optional(),
  identityMode: z.enum(["auto", "logo", "avatars"]).optional(),

  // ✅ persisted
  ctaEmphasisMode: z
    .enum(["first_primary", "last_primary", "all_primary", "none_primary"])
    .optional(),
  sequenceEnabled: z.boolean().optional(),
  showDelayAfterNavMs: z.number().min(0).optional(),
  autoCloseMs: z.number().min(0).optional(),
  betweenPopupsMs: z.number().min(0).optional(),
  maxSequenceItems: z.number().int().min(1).max(10).optional(),

  ctas: z
    .array(
      z.object({
        kind: z.enum(["open_chat", "open_booking", "open_url"]),
        label: z.string().min(1),
        url: z.string().optional(),
      }),
    )
    .optional(),
});

type PromoForm = z.infer<typeof PromoSchema>;

type ThemePreview = {
  primaryColor?: string | null;
  primaryTextColor?: string | null;
  secondaryColor?: string | null;
  secondaryTextColor?: string | null;
  nudgeBackgroundColor?: string | null;
  chatBubbleColor?: string | null;
};

interface PromosPanelProps {
  theme?: ThemePreview | null;
  brandLogoUrl?: string | null;
}

function getPrimaryIndex(mode: PromoForm["ctaEmphasisMode"], len: number) {
  if (!len) return 0;
  if (mode === "last_primary") return Math.max(0, len - 1);
  return 0;
}

function isPrimaryButton(mode: PromoForm["ctaEmphasisMode"], index: number, len: number) {
  const m = mode ?? "first_primary";
  if (m === "all_primary") return true;
  if (m === "none_primary") return false;
  if (m === "last_primary") return index === Math.max(0, len - 1);
  return index === 0;
}

export default function PromosPanel({ theme, brandLogoUrl }: PromosPanelProps) {
  const list = useQuery(api.private.promos.listByOrg, {});
  const upsert = useMutation(api.private.promos.upsert);
  const remove = useMutation(api.private.promos.remove);

  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm<PromoForm>({
    resolver: zodResolver(PromoSchema),
    defaultValues: {
      name: "Dual CTA • Chat or Book",
      active: true,
      showNudge: true,
      title: "Get help fast or schedule time",
      body: "Talk to the assistant now or book a 15-min demo.",
      badgeText: "Live",
      pathPrefix: "/",
      pathMode: "prefix", // "/" + prefix = all pages
      identityMode: "auto",
      ctaEmphasisMode: "first_primary",
      sequenceEnabled: true,
      showDelayAfterNavMs: 2500,
      autoCloseMs: 4500,
      betweenPopupsMs: 10000,
      maxSequenceItems: 3,
      ctas: [
        { kind: "open_chat", label: "Chat with AI Assistant", url: "" },
        { kind: "open_booking", label: "Book a meeting", url: "" },
      ],
    },
  });

  const { fields, append, remove: removeCta } = useFieldArray({
    control: form.control,
    name: "ctas",
  });

  /* ----------------- Presets ----------------- */

  const applyPresetDual = () => {
    const existingCtas = form.getValues("ctas") || [];
    form.reset({
      id: form.getValues("id"),
      name: "Dual CTA • Chat or Book",
      active: true,
      showNudge: form.getValues("showNudge") ?? true,
      title: "Get help fast or schedule time",
      body: "Talk to the assistant now or book a 15-min demo.",
      badgeText: "Live",
      pathPrefix: form.getValues("pathPrefix") || "/",
      pathMode: form.getValues("pathMode") ?? "prefix",
      identityMode: form.getValues("identityMode") ?? "auto",
      ctaEmphasisMode: form.getValues("ctaEmphasisMode") ?? "first_primary",
      sequenceEnabled: form.getValues("sequenceEnabled") ?? true,
      showDelayAfterNavMs: form.getValues("showDelayAfterNavMs") ?? 2500,
      autoCloseMs: form.getValues("autoCloseMs") ?? 4500,
      betweenPopupsMs: form.getValues("betweenPopupsMs") ?? 10000,
      maxSequenceItems: form.getValues("maxSequenceItems") ?? 3,
      ctas:
        existingCtas && existingCtas.length
          ? existingCtas
          : [
              { kind: "open_chat", label: "Chat with AI Assistant", url: "" },
              { kind: "open_booking", label: "Book a meeting", url: "" },
            ],
    });
  };

  const applyPresetSales = () => {
    const existingCtas = form.getValues("ctas") || [];
    form.reset({
      id: form.getValues("id"),
      name: "Sales CTA",
      active: true,
      showNudge: form.getValues("showNudge") ?? true,
      title: "Scale freely, adapt quickly",
      body: "Book a short call to learn how we help teams like yours.",
      badgeText: "Promo",
      pathPrefix: form.getValues("pathPrefix") || "/",
      pathMode: form.getValues("pathMode") ?? "prefix",
      identityMode: form.getValues("identityMode") ?? "auto",
      ctaEmphasisMode: form.getValues("ctaEmphasisMode") ?? "first_primary",
      sequenceEnabled: form.getValues("sequenceEnabled") ?? true,
      showDelayAfterNavMs: form.getValues("showDelayAfterNavMs") ?? 2500,
      autoCloseMs: form.getValues("autoCloseMs") ?? 4500,
      betweenPopupsMs: form.getValues("betweenPopupsMs") ?? 10000,
      maxSequenceItems: form.getValues("maxSequenceItems") ?? 3,
      ctas:
        existingCtas && existingCtas.length
          ? existingCtas
          : [
              { kind: "open_booking", label: "Book a meeting", url: "" },
              { kind: "open_chat", label: "Chat with AI Assistant", url: "" },
            ],
    });
  };

  const quickSetAllPages = () => {
    form.setValue("pathPrefix", "/");
    form.setValue("pathMode", "prefix"); // "/" + prefix = all pages
  };

  const quickSetHomepageOnly = () => {
    form.setValue("pathPrefix", "/");
    form.setValue("pathMode", "exact"); // "/" + exact = homepage only
  };

  /* ----------------- Submit ----------------- */

  const onSubmit: SubmitHandler<PromoForm> = async (values) => {
    const rules = {
      pathPrefix: values.pathPrefix || undefined,
      pathMode: values.pathMode ?? "prefix",
    };

    const rawCtas =
      (values.ctas || []).filter((c) => c && c.label && c.label.trim().length > 0) || [];

    const ctaList = rawCtas.map((c) => ({
      kind: c.kind,
      label: c.label.trim(),
      url: c.kind === "open_url" ? c.url : undefined,
    }));

    const mode = values.ctaEmphasisMode ?? "first_primary";
    const primaryIndex = getPrimaryIndex(mode, ctaList.length);

    const primaryCta =
      ctaList[primaryIndex] ||
      ({
        kind: "open_chat",
        label: "Chat with AI Assistant",
      } as const);

    const secondaryCta =
      ctaList.length > 1 ? ctaList.find((_, idx) => idx !== primaryIndex) : undefined;

    try {
      await upsert({
        _id: (values.id as any) || undefined,
        name: values.name,
        active: values.active,
        showNudge: values.showNudge ?? true,
        rules,
        card: {
          title: values.title,
          body: values.body,
          badgeText: values.badgeText || undefined,
        },
        primaryCta,
        secondaryCta,
        identityMode: values.identityMode ?? "auto",
        ctaList: ctaList.length ? ctaList : undefined,
        ctaEmphasisMode: mode,
        settings: {
          sequenceEnabled: values.sequenceEnabled ?? true,
          showDelayAfterNavMs: values.showDelayAfterNavMs ?? 2500,
          autoCloseMs: values.autoCloseMs ?? 4500,
          betweenPopupsMs: values.betweenPopupsMs ?? 10000,
          maxSequenceItems: values.maxSequenceItems ?? 3,
        },
      } as any);

      toast.success("Promo saved");
      setDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save promo");
    }
  };

  /* ----------------- Dialog helpers ----------------- */

  function openForCreate() {
    form.reset({
      id: undefined,
      name: "Dual CTA • Chat or Book",
      active: true,
      showNudge: true,
      title: "Get help fast or schedule time",
      body: "Talk to the assistant now or book a 15-min demo.",
      badgeText: "Live",
      pathPrefix: "/",
      pathMode: "prefix",
      identityMode: "auto",
      ctaEmphasisMode: "first_primary",
      sequenceEnabled: true,
      showDelayAfterNavMs: 2500,
      autoCloseMs: 4500,
      betweenPopupsMs: 10000,
      maxSequenceItems: 3,
      ctas: [
        { kind: "open_chat", label: "Chat with AI Assistant", url: "" },
        { kind: "open_booking", label: "Book a meeting", url: "" },
      ],
    });
    setDialogOpen(true);
  }

  function openForEdit(p: any) {
    const existingList = (p.ctaList ?? []) as {
      kind: "open_chat" | "open_booking" | "open_url";
      label: string;
      url?: string;
    }[];

    const derivedCtas = (
      existingList.length > 0
        ? existingList
        : [
            p.primaryCta
              ? { kind: p.primaryCta.kind, label: p.primaryCta.label, url: p.primaryCta.url }
              : undefined,
            p.secondaryCta
              ? { kind: p.secondaryCta.kind, label: p.secondaryCta.label, url: p.secondaryCta.url }
              : undefined,
          ]
    ).filter(
      (c): c is { kind: "open_chat" | "open_booking" | "open_url"; label: string; url?: string } =>
        !!c && typeof c.label === "string" && c.label.length > 0,
    );

    const ctasForForm: PromoForm["ctas"] =
      derivedCtas.length > 0
        ? derivedCtas
        : [{ kind: "open_chat", label: "Chat with AI Assistant", url: "" }];

    form.reset({
      id: p._id as string,
      name: p.name ?? "",
      active: !!p.active,
      showNudge: p.showNudge !== false,
      title: p.card?.title ?? "",
      body: p.card?.body ?? "",
      badgeText: p.card?.badgeText ?? "",
      pathPrefix: p.rules?.pathPrefix ?? "/",
      pathMode: (p.rules?.pathMode as "prefix" | "exact") ?? "prefix",
      identityMode: (p.identityMode as "auto" | "logo" | "avatars") ?? "auto",
      ctaEmphasisMode: (p.ctaEmphasisMode as PromoForm["ctaEmphasisMode"]) ?? "first_primary",
      sequenceEnabled: p.settings?.sequenceEnabled ?? true,
      showDelayAfterNavMs: p.settings?.showDelayAfterNavMs ?? 2500,
      autoCloseMs: p.settings?.autoCloseMs ?? 4500,
      betweenPopupsMs: p.settings?.betweenPopupsMs ?? 10000,
      maxSequenceItems: p.settings?.maxSequenceItems ?? 3,
      ctas: ctasForForm,
    });

    setDialogOpen(true);
  }

  /* ----------------- Preview values ----------------- */

  const previewTitle = form.watch("title") || "Get help fast or schedule time";
  const previewBody = form.watch("body") || "Talk to the assistant now or book a 15-min demo.";
  const previewBadge = form.watch("badgeText") || "Live";

  const rawPreviewCtas = form.watch("ctas") || [];
  const previewCtas = rawPreviewCtas.filter((c) => c && c.label && c.label.trim().length > 0);

  const identityMode = form.watch("identityMode") ?? "auto";
  const emphasisMode = form.watch("ctaEmphasisMode") ?? "first_primary";

  const pathMode = form.watch("pathMode") ?? "prefix";
  const pathPrefix = form.watch("pathPrefix") ?? "/";

  const primaryColor = theme?.primaryColor || "#a855f7";
  const primaryTextColor = theme?.primaryTextColor || "#ffffff";
  const secondaryColor = theme?.secondaryColor || "#ffffff";
  const secondaryTextColor = theme?.secondaryTextColor || "#0f172a";
  const nudgeBackgroundColor = theme?.nudgeBackgroundColor || "#ffffff";
  const chatBubbleColor = theme?.chatBubbleColor || primaryColor;

  const showLogo =
    (identityMode === "logo" && !!brandLogoUrl) || (identityMode === "auto" && !!brandLogoUrl);
  const showAvatars = identityMode === "avatars" || (identityMode === "auto" && !brandLogoUrl);

  const effectivePreviewCtas =
    previewCtas.length > 0
      ? previewCtas
      : [
          { kind: "open_chat" as const, label: "Chat with AI Assistant" },
          { kind: "open_booking" as const, label: "Book a meeting" },
        ];

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Promos (by page)</CardTitle>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openForCreate}>
              New Promo
            </Button>
          </DialogTrigger>

          <DialogContent
            className="
              w-full
              max-w-[95vw]
              sm:max-w-[1200px]
              max-h-[85vh]
              overflow-hidden
              rounded-xl
              p-0
            "
          >
            <DialogHeader className="px-6 pb-2 pt-4">
              <DialogTitle className="text-base font-semibold">
                {form.watch("id") ? "Edit promo" : "Create a promo"}
              </DialogTitle>
            </DialogHeader>

            <div
              className="
                grid
                h-[75vh]
                grid-cols-1
                gap-6
                overflow-hidden
                px-6
                pb-6
                pt-0
                md:grid-cols-[2fr_1fr]
              "
            >
              {/* Left column: form (scrollable) */}
              <div className="flex flex-col overflow-hidden">
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="flex-1 space-y-4 overflow-y-auto pr-4"
                >
                  <input type="hidden" {...form.register("id")} />

                  {/* Basic info + presets */}
                  <section className="space-y-3 rounded-xl border bg-muted/40 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Basic info
                        </Label>
                        <div>
                          <Label>Name</Label>
                          <Input {...form.register("name")} placeholder="Internal name" />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-6">
                        <Label className="text-xs text-muted-foreground">Active</Label>
                        <Switch
                          checked={!!form.watch("active")}
                          onCheckedChange={(v) => form.setValue("active", v)}
                        />
                      </div>

                      <div className="flex flex-col gap-1 pt-6">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs font-medium">Show nudge</Label>
                          <Switch
                            checked={form.watch("showNudge") ?? true}
                            onCheckedChange={(v) => form.setValue("showNudge", v)}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Display the promo card on matching pages (turn off to hide it)
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Start from a preset:</span>
                      <Button type="button" variant="outline" size="sm" onClick={applyPresetDual}>
                        Chat + Book
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={applyPresetSales}>
                        Sales push
                      </Button>
                    </div>
                  </section>

                  {/* Targeting */}
                  <section className="space-y-3 rounded-xl border bg-muted/40 p-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Where does this promo appear?
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Choose the pages where visitors will see this nudge.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={quickSetAllPages}>
                        All pages
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={quickSetHomepageOnly}>
                        Homepage only
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <Label>Page path</Label>
                        <Input
                          {...form.register("pathPrefix")}
                          placeholder="/pricing"
                          className="font-mono text-sm"
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Use the real URL path. Example: for <code>yoursite.com/pricing</code>, enter{" "}
                          <code>/pricing</code>
                        </p>
                      </div>

                      <div>
                        <Label>Scope</Label>
                        <Select
                          value={pathMode}
                          onValueChange={(v) => form.setValue("pathMode", v as "prefix" | "exact")}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Scope" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="exact">Only this exact page</SelectItem>
                            <SelectItem value="prefix">This page and its subpages</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Exact = only <code>{pathPrefix || "/"}</code>. Prefix = also{" "}
                          <code>{pathPrefix || "/"}</code>/*.
                        </p>
                      </div>

                      <div className="md:col-span-2 md:flex md:items-center md:gap-3">
                        <div className="flex-1">
                          <Label>Identity in nudge</Label>
                          <Select
                            value={identityMode}
                            onValueChange={(v) =>
                              form.setValue("identityMode", v as "auto" | "logo" | "avatars")
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Auto" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Auto (logo if set, otherwise reps)</SelectItem>
                              <SelectItem value="logo">Always use logo</SelectItem>
                              <SelectItem value="avatars">Use team avatars only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground md:w-1/2">
                          Logo or team avatars in the nudge.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2.5 text-sm">
                      <span className="font-medium text-emerald-800">Shows on: </span>
                      <span className="text-emerald-700">
                        {pathPrefix === "/" && pathMode === "exact"
                          ? "Homepage only"
                          : pathPrefix === "/" && pathMode === "prefix"
                            ? "All pages"
                            : pathMode === "exact"
                              ? `Only page ${pathPrefix || "/"}`
                              : `Page ${pathPrefix || "/"} and subpages`}
                      </span>
                    </div>
                  </section>

                  {/* Sequence behavior */}
                  <section className="space-y-3 rounded-xl border bg-muted/40 p-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Sequence behavior
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Control popup timing: show, auto-close, and delay before next promo.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                        <div>
                          <Label className="text-xs">Enable sequence</Label>
                          <p className="text-[11px] text-muted-foreground">Show multiple matched promos one by one.</p>
                        </div>
                        <Switch
                          checked={form.watch("sequenceEnabled") ?? true}
                          onCheckedChange={(v) => form.setValue("sequenceEnabled", v)}
                        />
                      </div>

                      <div>
                        <Label>Max sequence items</Label>
                        <Input
                          type="number"
                          {...form.register("maxSequenceItems", { valueAsNumber: true })}
                          min={1}
                          max={10}
                        />
                      </div>

                      <div>
                        <Label>First popup delay (ms)</Label>
                        <Input
                          type="number"
                          {...form.register("showDelayAfterNavMs", { valueAsNumber: true })}
                          min={0}
                        />
                      </div>

                      <div>
                        <Label>Auto-close after (ms)</Label>
                        <Input
                          type="number"
                          {...form.register("autoCloseMs", { valueAsNumber: true })}
                          min={0}
                        />
                      </div>

                      <div>
                        <Label>Delay before next popup (ms)</Label>
                        <Input
                          type="number"
                          {...form.register("betweenPopupsMs", { valueAsNumber: true })}
                          min={0}
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Example: <code>10000</code> = next nudge appears 10s later.
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Message & CTAs */}
                  <section className="space-y-4 rounded-xl border bg-muted/40 p-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Message & buttons
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        This is the content visitors will see in the promo nudge.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label>Title</Label>
                        <Input {...form.register("title")} />
                      </div>
                      <div>
                        <Label>Body</Label>
                        <Textarea rows={3} {...form.register("body")} />
                      </div>
                      <div className="max-w-xs">
                        <Label>Badge (optional)</Label>
                        <Input {...form.register("badgeText")} placeholder="Live" />
                      </div>
                    </div>

                    {/* CTA emphasis */}
                    <div className="rounded-lg bg-background px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-700">CTA emphasis</p>
                          <p className="text-[11px] text-muted-foreground">
                            Choose which button is highlighted (primary style).
                          </p>
                        </div>

                        <div className="inline-flex flex-wrap gap-2">
                          {[
                            { k: "first_primary", label: "First primary" },
                            { k: "last_primary", label: "Last primary" },
                            { k: "all_primary", label: "All primary" },
                            { k: "none_primary", label: "None primary" },
                          ].map((opt) => (
                            <Button
                              key={opt.k}
                              type="button"
                              size="sm"
                              variant={emphasisMode === opt.k ? "default" : "outline"}
                              className="h-7 rounded-full px-3 text-[11px]"
                              onClick={() =>
                                form.setValue("ctaEmphasisMode", opt.k as PromoForm["ctaEmphasisMode"])
                              }
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Multi-CTA list */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Call-to-actions</Label>
                          <p className="text-xs text-muted-foreground">
                            Buttons are shown vertically in the promo.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => append({ kind: "open_chat", label: "New CTA", url: "" })}
                        >
                          Add CTA
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {fields.length === 0 && (
                          <p className="text-xs text-muted-foreground">No CTA yet. Add at least one.</p>
                        )}

                        {fields.map((field, index) => (
                          <div
                            key={field.id}
                            className="space-y-2 rounded-lg border bg-background p-3 text-sm shadow-[0_1px_0_rgba(15,23,42,0.03)]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-slate-700">
                                  CTA #{index + 1}
                                </span>

                                {isPrimaryButton(emphasisMode, index, fields.length) && (
                                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                                    Primary
                                  </span>
                                )}
                              </div>

                              {fields.length > 1 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs text-muted-foreground hover:text-destructive"
                                  onClick={() => removeCta(index)}
                                >
                                  Remove
                                </Button>
                              )}
                            </div>

                            <div className="flex flex-col gap-2 md:flex-row">
                              <div className="md:w-40">
                                <Label className="text-xs">Type</Label>
                                <Select
                                  value={form.watch(`ctas.${index}.kind`) || "open_chat"}
                                  onValueChange={(v) =>
                                    form.setValue(
                                      `ctas.${index}.kind`,
                                      v as "open_chat" | "open_booking" | "open_url",
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="open_chat">Open chat</SelectItem>
                                    <SelectItem value="open_booking">Open booking</SelectItem>
                                    <SelectItem value="open_url">Open URL</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="flex-1">
                                <Label className="text-xs">Label</Label>
                                <Input
                                  className="h-8 text-sm"
                                  {...form.register(`ctas.${index}.label` as const)}
                                  placeholder="Button label"
                                />
                              </div>
                            </div>

                            {form.watch(`ctas.${index}.kind`) === "open_url" && (
                              <div>
                                <Label className="text-xs">URL</Label>
                                <Input
                                  className="h-8 text-sm"
                                  {...form.register(`ctas.${index}.url` as const)}
                                  placeholder="https://…"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end border-t pt-3">
                      <Button type="submit">{form.watch("id") ? "Update promo" : "Save promo"}</Button>
                    </div>
                  </section>
                </form>
              </div>

              {/* Right column: preview */}
              <div className="hidden min-w-[360px] pl-4 md:flex md:flex-col">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Promo preview
                </div>
                <div className="flex flex-1 items-center justify-center rounded-xl border bg-slate-50 px-4 py-6">
                  <div
                    className="w-full max-w-sm space-y-3 rounded-2xl border p-4 shadow-lg shadow-slate-200"
                    style={{ backgroundColor: nudgeBackgroundColor }}
                  >
                    <div className="flex items-center gap-3">
                      {showLogo && brandLogoUrl ? (
                        <img
                          src={brandLogoUrl}
                          alt="Logo"
                          className="h-9 w-9 rounded-full border bg-white object-contain"
                        />
                      ) : null}

                      {showAvatars && (
                        <div className="flex -space-x-1">
                          <div className="h-7 w-7 rounded-full border border-white bg-slate-200" />
                          <div className="h-7 w-7 rounded-full border border-white bg-slate-300" />
                          <div className="h-7 w-7 rounded-full border border-white bg-slate-400" />
                        </div>
                      )}

                      {!showLogo && !showAvatars && (
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
                          style={{ backgroundColor: chatBubbleColor, color: primaryTextColor }}
                        >
                          AI
                        </div>
                      )}

                      <div className="min-w-0 space-y-1">
                        {previewBadge && (
                          <div
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                            style={{ backgroundColor: `${primaryColor}1A`, color: primaryColor }}
                          >
                            {previewBadge}
                          </div>
                        )}
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {previewTitle}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs leading-relaxed text-slate-600">{previewBody}</p>

                    <div className="space-y-2">
                      {effectivePreviewCtas.map((cta, index) => {
                        const primary = isPrimaryButton(emphasisMode, index, effectivePreviewCtas.length);

                        const style = primary
                          ? { backgroundColor: primaryColor, color: primaryTextColor, borderColor: primaryColor }
                          : { backgroundColor: secondaryColor, color: secondaryTextColor, borderColor: primaryColor };

                        return (
                          <Button
                            key={index}
                            type="button"
                            size="sm"
                            className="h-8 w-full justify-center text-sm"
                            variant={primary ? "default" : "outline"}
                            style={style}
                          >
                            {cta.label}
                          </Button>
                        );
                      })}
                    </div>

                    <p className="text-[10px] text-slate-400">Preview uses your branding colors.</p>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-4">
        <Separator />

        {!list?.length && <p className="text-sm text-muted-foreground">No promos yet.</p>}

        {list?.map((p) => (
          <div
            key={p._id}
            className="flex items-center justify-between gap-4 rounded-lg border bg-background px-3 py-2.5 text-sm shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-colors hover:bg-muted/60"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate font-medium">{p.name}</div>

                {p.identityMode && (
                  <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    {p.identityMode === "logo" ? "Logo" : p.identityMode === "avatars" ? "Avatars" : "Auto"}
                  </span>
                )}

                {p.ctaEmphasisMode && (
                  <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    {p.ctaEmphasisMode === "first_primary"
                      ? "First primary"
                      : p.ctaEmphasisMode === "last_primary"
                        ? "Last primary"
                        : p.ctaEmphasisMode === "all_primary"
                          ? "All primary"
                          : "None primary"}
                  </span>
                )}

                {!p.active && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    Paused
                  </span>
                )}
              </div>

              <div className="truncate text-xs text-muted-foreground">
                {p.card?.title} — {p.card?.body}
              </div>

              {(p.rules?.pathPrefix || p.rules?.pathMode) && (
                <div className="mt-1">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      p.showNudge !== false
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {p.showNudge === false
                      ? "Nudge hidden"
                      : (() => {
                          const pref = p.rules?.pathPrefix ?? "/";
                          const mode = p.rules?.pathMode ?? "prefix";
                          if (pref === "/" && mode === "exact") return "Shows on: Homepage only";
                          if (pref === "/" && mode === "prefix") return "Shows on: All pages";
                          if (mode === "exact") return `Shows on: ${pref} only`;
                          return `Shows on: ${pref} + subpages`;
                        })()}
                  </span>
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Switch
                checked={p.active}
                onCheckedChange={async (v) => {
                  try {
                    await upsert({
                      _id: p._id as any,
                      name: p.name,
                      active: v,
                      showNudge: p.showNudge !== false,
                      rules: p.rules, // contains pathMode now
                      card: p.card,
                      primaryCta: p.primaryCta,
                      secondaryCta: p.secondaryCta,
                      identityMode: p.identityMode ?? "auto",
                      ctaList: p.ctaList,
                      ctaEmphasisMode: p.ctaEmphasisMode ?? "first_primary",
                    } as any);
                  } catch (e) {
                    console.error(e);
                    toast.error("Update failed");
                  }
                }}
              />
              <Button variant="outline" size="sm" onClick={() => openForEdit(p)}>
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!confirm("Delete promo?")) return;
                  try {
                    await remove({ _id: p._id as any });
                  } catch (e) {
                    console.error(e);
                    toast.error("Delete failed");
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
