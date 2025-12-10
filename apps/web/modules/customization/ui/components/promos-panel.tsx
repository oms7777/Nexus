"use client";

import { useState } from "react";
import { useForm, SubmitHandler, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { Separator } from "@workspace/ui/components/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { toast } from "sonner";

const PromoSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  active: z.boolean(),
  pathPrefix: z.string().optional(),
  urlIncludes: z.string().optional(),
  utmSource: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  badgeText: z.string().optional(),
  targetRole: z.enum(["sales", "support"]).optional(),
  identityMode: z.enum(["auto", "logo", "avatars"]).optional(),
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

export default function PromosPanel() {
  const list = useQuery(api.private.promos.listByOrg, {});
  const upsert = useMutation(api.private.promos.upsert);
  const remove = useMutation(api.private.promos.remove);
  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm<PromoForm>({
    resolver: zodResolver(PromoSchema),
    defaultValues: {
      name: "Dual CTA • Chat or Book",
      active: true,
      title: "Get help fast or schedule time",
      body: "Talk to the assistant now or book a 15-min demo.",
      badgeText: "Live",
      pathPrefix: "",
      urlIncludes: "",
      utmSource: "",
      targetRole: "sales",
      identityMode: "auto",
      ctas: [
        {
          kind: "open_chat",
          label: "Chat with AI Assistant",
          url: "",
        },
        {
          kind: "open_booking",
          label: "Book a meeting",
          url: "",
        },
      ],
    },
  });

  const { fields, append, remove: removeCta } = useFieldArray({
    control: form.control,
    name: "ctas",
  });

  const applyPresetDual = () => {
    const existingCtas = form.getValues("ctas") || [];
    form.reset({
      id: form.getValues("id"),
      name: "Dual CTA • Chat or Book",
      active: true,
      title: "Get help fast or schedule time",
      body: "Talk to the assistant now or book a 15-min demo.",
      badgeText: "Live",
      pathPrefix: form.getValues("pathPrefix") || "",
      urlIncludes: form.getValues("urlIncludes") || "",
      utmSource: form.getValues("utmSource") || "",
      targetRole: form.getValues("targetRole") ?? "sales",
      identityMode: form.getValues("identityMode") ?? "auto",
      ctas:
        existingCtas && existingCtas.length
          ? existingCtas
          : [
              {
                kind: "open_chat",
                label: "Chat with AI Assistant",
                url: "",
              },
              {
                kind: "open_booking",
                label: "Book a meeting",
                url: "",
              },
            ],
    });
  };

  const applyPresetSales = () => {
    const existingCtas = form.getValues("ctas") || [];
    form.reset({
      id: form.getValues("id"),
      name: "Sales CTA",
      active: true,
      title: "Scale freely, adapt quickly",
      body: "Book a short call to learn how we help teams like yours.",
      badgeText: "Promo",
      pathPrefix: form.getValues("pathPrefix") || "",
      urlIncludes: form.getValues("urlIncludes") || "",
      utmSource: form.getValues("utmSource") || "",
      targetRole: "sales",
      identityMode: form.getValues("identityMode") ?? "auto",
      ctas:
        existingCtas && existingCtas.length
          ? existingCtas
          : [
              {
                kind: "open_booking",
                label: "Book a meeting",
                url: "",
              },
              {
                kind: "open_chat",
                label: "Chat with AI Assistant",
                url: "",
              },
            ],
    });
  };

  const onSubmit: SubmitHandler<PromoForm> = async (values) => {
    const rules = {
      pathPrefix: values.pathPrefix || undefined,
      urlIncludes: values.urlIncludes
        ? values.urlIncludes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      utmSource: values.utmSource
        ? values.utmSource
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    };

    const rawCtas =
      (values.ctas || []).filter(
        (c) => c && c.label && c.label.trim().length > 0,
      ) || [];

    // Transforme en ctaList propre (URL seulement pour open_url)
    const ctaList = rawCtas.map((c) => ({
      kind: c.kind,
      label: c.label.trim(),
      url: c.kind === "open_url" ? c.url : undefined,
    }));

    // Compat : primary / secondary dérivés des 2 premiers
    const primaryCta =
      ctaList[0] || ({
        kind: "open_chat",
        label: "Chat with AI Assistant",
      } as const);

    const secondaryCta = ctaList[1] ?? undefined;

    try {
      await upsert({
        _id: (values.id as any) || undefined,
        name: values.name,
        active: values.active,
        rules,
        card: {
          title: values.title,
          body: values.body,
          badgeText: values.badgeText || undefined,
        },
        primaryCta,
        secondaryCta,
        targetRole: values.targetRole,
        identityMode: values.identityMode ?? "auto",
        ctaList: ctaList.length ? ctaList : undefined,
      } as any);
      toast.success("Promo saved");
      setDialogOpen(false);
    } catch {
      toast.error("Failed to save promo");
    }
  };

  // --- Dialog helpers
  function openForCreate() {
    form.reset({
      id: undefined,
      name: "Dual CTA • Chat or Book",
      active: true,
      title: "Get help fast or schedule time",
      body: "Talk to the assistant now or book a 15-min demo.",
      badgeText: "Live",
      pathPrefix: "",
      urlIncludes: "",
      utmSource: "",
      targetRole: "sales",
      identityMode: "auto",
      ctas: [
        {
          kind: "open_chat",
          label: "Chat with AI Assistant",
          url: "",
        },
        {
          kind: "open_booking",
          label: "Book a meeting",
          url: "",
        },
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

    // On dérive les CTAs à partir de ctaList ou des primary/secondary legacy
    const derivedCtas = (
      existingList.length > 0
        ? existingList
        : [
            p.primaryCta
              ? {
                  kind: p.primaryCta
                    .kind as "open_chat" | "open_booking" | "open_url",
                  label: p.primaryCta.label as string,
                  url: p.primaryCta.url as string | undefined,
                }
              : undefined,
            p.secondaryCta
              ? {
                  kind: p.secondaryCta
                    .kind as "open_chat" | "open_booking" | "open_url",
                  label: p.secondaryCta.label as string,
                  url: p.secondaryCta.url as string | undefined,
                }
              : undefined,
          ]
    ).filter(
      (
        c,
      ): c is {
        kind: "open_chat" | "open_booking" | "open_url";
        label: string;
        url?: string;
      } => !!c && typeof c.label === "string" && c.label.length > 0,
    );

    const ctasForForm: PromoForm["ctas"] =
      derivedCtas.length > 0
        ? derivedCtas
        : [
            {
              kind: "open_chat",
              label: "Chat with AI Assistant",
              url: "",
            },
          ];

    form.reset({
      id: p._id as string,
      name: p.name ?? "",
      active: !!p.active,
      title: p.card?.title ?? "",
      body: p.card?.body ?? "",
      badgeText: p.card?.badgeText ?? "",
      pathPrefix: p.rules?.pathPrefix ?? "",
      urlIncludes: (p.rules?.urlIncludes ?? []).join(","),
      utmSource: (p.rules?.utmSource ?? []).join(","),
      targetRole: (p.targetRole as "sales" | "support") ?? "sales",
      identityMode: (p.identityMode as "auto" | "logo" | "avatars") ?? "auto",
      ctas: ctasForForm,
    });

    setDialogOpen(true);
  }


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

          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {form.watch("id") ? "Edit promo" : "Create a promo"}
              </DialogTitle>
            </DialogHeader>

            <div className="mb-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={applyPresetDual}>
                Preset: Chat + Book
              </Button>
              <Button variant="outline" size="sm" onClick={applyPresetSales}>
                Preset: Sales push
              </Button>
            </div>

            <form
              className="grid grid-cols-1 gap-4 md:grid-cols-2"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <input type="hidden" {...form.register("id")} />

              <div className="col-span-2 flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <Label>Name</Label>
                  <Input
                    {...form.register("name")}
                    placeholder="Internal name"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label>Active</Label>
                  <Switch
                    checked={!!form.watch("active")}
                    onCheckedChange={(v) => form.setValue("active", v)}
                  />
                </div>
              </div>

              <Separator className="col-span-2" />

              <div>
                <Label>Path prefix (optional)</Label>
                <Input
                  {...form.register("pathPrefix")}
                  placeholder="/pricing"
                />
              </div>
              <div>
                <Label>URL includes (comma)</Label>
                <Input
                  {...form.register("urlIncludes")}
                  placeholder="pricing,plans"
                />
              </div>
              <div>
                <Label>UTM source (comma)</Label>
                <Input
                  {...form.register("utmSource")}
                  placeholder="ads,newsletter"
                />
              </div>

              <div>
                <Label>Target team</Label>
                <Select
                  value={form.watch("targetRole") ?? "sales"}
                  onValueChange={(v) =>
                    form.setValue("targetRole", v as "sales" | "support")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose team…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Determines which reps (sales or support) can receive this
                  promo’s leads.
                </p>
              </div>

              {/* Identity toggle */}
              <div>
                <Label>Identity in nudge</Label>
                <Select
                  value={form.watch("identityMode") ?? "auto"}
                  onValueChange={(v) =>
                    form.setValue(
                      "identityMode",
                      v as "auto" | "logo" | "avatars",
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      Auto (logo if set, otherwise reps)
                    </SelectItem>
                    <SelectItem value="logo">Always use logo</SelectItem>
                    <SelectItem value="avatars">
                      Use team avatars only
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose whether the nudge shows your company logo or the 3
                  sales avatars.
                </p>
              </div>

              <Separator className="col-span-2" />

              <div className="col-span-2">
                <Label>Title</Label>
                <Input {...form.register("title")} />
              </div>
              <div className="col-span-2">
                <Label>Body</Label>
                <Textarea rows={3} {...form.register("body")} />
              </div>
              <div>
                <Label>Badge (optional)</Label>
                <Input
                  {...form.register("badgeText")}
                  placeholder="Limited time"
                />
              </div>

              <Separator className="col-span-2" />

              {/* Multi-CTA list */}
              <div className="col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <Label>Call-to-actions</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      append({
                        kind: "open_chat",
                        label: "New CTA",
                        url: "",
                      })
                    }
                  >
                    Add CTA
                  </Button>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Buttons will be shown vertically in the promo nudge (top =
                  primary style).
                </p>

                <div className="space-y-3">
                  {fields.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No CTA yet. Add at least one.
                    </p>
                  )}

                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="rounded-md border p-3 text-sm"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-medium">
                          CTA #{index + 1}
                          {index === 0 && (
                            <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                              Primary
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => removeCta(index)}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 md:flex-row">
                        <div className="md:w-40">
                          <Label className="text-xs">Type</Label>
                          <Select
                            value={
                              form.watch(`ctas.${index}.kind`) ||
                              "open_chat"
                            }
                            onValueChange={(v) =>
                              form.setValue(
                                `ctas.${index}.kind`,
                                v as "open_chat" | "open_booking" | "open_url",
                              )
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open_chat">
                                Open chat
                              </SelectItem>
                              <SelectItem value="open_booking">
                                Open booking
                              </SelectItem>
                              <SelectItem value="open_url">
                                Open URL
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs">Label</Label>
                          <Input
                            className="h-8"
                            {...form.register(`ctas.${index}.label` as const)}
                            placeholder="Button label"
                          />
                        </div>
                      </div>

                      {form.watch(`ctas.${index}.kind`) === "open_url" && (
                        <div className="mt-2">
                          <Label className="text-xs">URL</Label>
                          <Input
                            className="h-8"
                            {...form.register(`ctas.${index}.url` as const)}
                            placeholder="https://…"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="col-span-2 flex justify-end">
                <Button type="submit">
                  {form.watch("id") ? "Update promo" : "Save promo"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-4">
        <Separator />
        {!list?.length && (
          <p className="text-sm text-muted-foreground">No promos yet.</p>
        )}

        {list?.map((p) => (
          <div
            key={p._id}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">
                {p.name}
                {p.targetRole && (
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    {p.targetRole === "sales" ? "Sales" : "Support"}
                  </span>
                )}
                {p.identityMode && (
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    {p.identityMode === "logo"
                      ? "Logo"
                      : p.identityMode === "avatars"
                      ? "Avatars"
                      : "Auto"}
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {p.card?.title} — {p.card?.body}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={p.active}
                onCheckedChange={async (v) => {
                  try {
                    await upsert({
                      _id: p._id as any,
                      name: p.name,
                      active: v,
                      rules: p.rules,
                      card: p.card,
                      primaryCta: p.primaryCta,
                      secondaryCta: p.secondaryCta,
                      targetRole: p.targetRole,
                      identityMode: p.identityMode ?? "auto",
                      ctaList: p.ctaList,
                    } as any);
                  } catch {
                    toast.error("Update failed");
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => openForEdit(p)}
              >
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!confirm("Delete promo?")) return;
                  try {
                    await remove({ _id: p._id as any });
                  } catch {
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
