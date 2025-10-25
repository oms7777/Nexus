"use client";

import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
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
  pathPrefix: z.string().optional(),
  urlIncludes: z.string().optional(),
  utmSource: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  badgeText: z.string().optional(),
  primaryKind: z.enum(["open_chat", "open_booking", "open_url"]),
  primaryLabel: z.string().min(1),
  primaryUrl: z.string().url().optional(),
  secondaryKind: z.enum(["none", "open_chat", "open_booking", "open_url"]),
  secondaryLabel: z.string().optional(),
  secondaryUrl: z.string().url().optional(),
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
      primaryKind: "open_chat",
      primaryLabel: "Chat with AI Assistant",
      secondaryKind: "open_booking",
      secondaryLabel: "Book a meeting",
    },
  });

  const applyPresetDual = () =>
    form.reset({
      name: "Dual CTA • Chat or Book",
      active: true,
      title: "Get help fast or schedule time",
      body: "Talk to the assistant now or book a 15-min demo.",
      badgeText: "Live",
      primaryKind: "open_chat",
      primaryLabel: "Chat with AI Assistant",
      secondaryKind: "open_booking",
      secondaryLabel: "Book a meeting",
    });

  const applyPresetSales = () =>
    form.reset({
      name: "Sales CTA",
      active: true,
      title: "Scale freely, adapt quickly",
      body: "Book a short call to learn how we help teams like yours.",
      badgeText: "Promo",
      primaryKind: "open_booking",
      primaryLabel: "Book a meeting",
      secondaryKind: "open_chat",
      secondaryLabel: "Chat with AI Assistant",
    });

  const onSubmit: SubmitHandler<PromoForm> = async (values) => {
    const rules = {
      pathPrefix: values.pathPrefix || undefined,
      urlIncludes: values.urlIncludes
        ? values.urlIncludes.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
      utmSource: values.utmSource
        ? values.utmSource.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
    };

    const primaryCta = {
      kind: values.primaryKind,
      label: values.primaryLabel,
      url: values.primaryKind === "open_url" ? values.primaryUrl : undefined,
    };

    const secondaryCta =
      values.secondaryKind === "none"
        ? undefined
        : {
            kind: values.secondaryKind as "open_chat" | "open_booking" | "open_url",
            label: values.secondaryLabel || "",
            url: values.secondaryKind === "open_url" ? values.secondaryUrl : undefined,
          };

    try {
      await upsert({
        _id: (values.id as any) || undefined,
        name: values.name,
        active: values.active,
        rules,
        card: { title: values.title, body: values.body, badgeText: values.badgeText || undefined },
        primaryCta,
        secondaryCta,
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
      primaryKind: "open_chat",
      primaryLabel: "Chat with AI Assistant",
      secondaryKind: "open_booking",
      secondaryLabel: "Book a meeting",
      primaryUrl: undefined,
      secondaryUrl: undefined,
    });
    setDialogOpen(true);
  }

  function openForEdit(p: any) {
    form.reset({
      id: p._id,
      name: p.name ?? "",
      active: !!p.active,
      title: p.card?.title ?? "",
      body: p.card?.body ?? "",
      badgeText: p.card?.badgeText ?? "",
      pathPrefix: p.rules?.pathPrefix ?? "",
      urlIncludes: (p.rules?.urlIncludes ?? []).join(","),
      utmSource: (p.rules?.utmSource ?? []).join(","),
      primaryKind: p.primaryCta?.kind ?? "open_chat",
      primaryLabel: p.primaryCta?.label ?? "",
      primaryUrl: p.primaryCta?.url ?? undefined,
      secondaryKind: p.secondaryCta?.kind ?? "none",
      secondaryLabel: p.secondaryCta?.label ?? "",
      secondaryUrl: p.secondaryCta?.url ?? undefined,
    });
    setDialogOpen(true);
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Promos (by page)</CardTitle>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openForCreate}>New Promo</Button>
          </DialogTrigger>

          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{form.watch("id") ? "Edit promo" : "Create a promo"}</DialogTitle>
            </DialogHeader>

            <div className="mb-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={applyPresetDual}>Preset: Chat + Book</Button>
              <Button variant="outline" size="sm" onClick={applyPresetSales}>Preset: Sales push</Button>
            </div>

            <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
              <input type="hidden" {...form.register("id")} />

              <div className="col-span-2 flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <Label>Name</Label>
                  <Input {...form.register("name")} placeholder="Internal name" />
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
                <Input {...form.register("pathPrefix")} placeholder="/solutions" />
              </div>
              <div>
                <Label>URL includes (comma)</Label>
                <Input {...form.register("urlIncludes")} placeholder="observability,kubernetes" />
              </div>
              <div>
                <Label>UTM source (comma)</Label>
                <Input {...form.register("utmSource")} placeholder="ads,newsletter" />
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
                <Input {...form.register("badgeText")} placeholder="Limited time" />
              </div>

              <Separator className="col-span-2" />

              {/* Primary CTA */}
              <div>
                <Label>Primary CTA</Label>
                <div className="mt-2 flex gap-2">
                  <Select
                    value={form.watch("primaryKind")}
                    onValueChange={(v) => form.setValue("primaryKind", v as any)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open_chat">Open chat</SelectItem>
                      <SelectItem value="open_booking">Open booking</SelectItem>
                      <SelectItem value="open_url">Open URL</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input className="flex-1" {...form.register("primaryLabel")} placeholder="Button label" />
                </div>
                {form.watch("primaryKind") === "open_url" && (
                  <Input className="mt-2" {...form.register("primaryUrl")} placeholder="https://…" />
                )}
              </div>

              {/* Secondary CTA */}
              <div>
                <Label>Secondary CTA</Label>
                <div className="mt-2 flex gap-2">
                  <Select
                    value={form.watch("secondaryKind")}
                    onValueChange={(v) => form.setValue("secondaryKind", v as any)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="open_chat">Open chat</SelectItem>
                      <SelectItem value="open_booking">Open booking</SelectItem>
                      <SelectItem value="open_url">Open URL</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    disabled={form.watch("secondaryKind") === "none"}
                    className="flex-1"
                    {...form.register("secondaryLabel")}
                    placeholder="Button label"
                  />
                </div>
                {form.watch("secondaryKind") === "open_url" && (
                  <Input className="mt-2" {...form.register("secondaryUrl")} placeholder="https://…" />
                )}
              </div>

              <div className="col-span-2 flex justify-end">
                <Button type="submit">{form.watch("id") ? "Update promo" : "Save promo"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-4">
        <Separator />
        {!list?.length && <p className="text-sm text-muted-foreground">No promos yet.</p>}

        {list?.map((p) => (
          <div key={p._id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="min-w-0">
              <div className="truncate font-medium">{p.name}</div>
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
                    } as any);
                  } catch {
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
