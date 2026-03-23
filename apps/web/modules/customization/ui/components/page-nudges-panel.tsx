"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import { Switch } from "@workspace/ui/components/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { toast } from "sonner";

const PageNudgeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  active: z.boolean(),

  pathPrefix: z.string().optional(),
  pathMode: z.enum(["prefix", "exact"]).optional(),

  suggestion1: z.string().optional(),
  suggestion2: z.string().optional(),
  suggestion3: z.string().optional(),

  sequenceCount: z.number().int().min(1).max(5).optional(),
  showDelayAfterNavMs: z.number().min(0).optional(),
  minDelayMs: z.number().min(0).optional(),
  autoCloseMs: z.number().min(0).optional(),
  betweenPopupsMs: z.number().min(0).optional(),
});

type PageNudgeForm = z.infer<typeof PageNudgeSchema>;

function cleanSuggestion(s?: string) {
  const v = (s ?? "").trim();
  return v.length ? v : undefined;
}

export default function PageNudgesPanel() {
  const list = useQuery((api.private as any).nudges.listByOrg, {}) ?? [];
  const upsert = useMutation((api.private as any).nudges.upsert);
  const remove = useMutation((api.private as any).nudges.remove);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const defaults: PageNudgeForm = useMemo(
    () => ({
      name: "Homepage quick answers",
      active: true,
      pathPrefix: "/",
      pathMode: "exact",
      suggestion1: "",
      suggestion2: "",
      suggestion3: "",
      sequenceCount: 3,
      showDelayAfterNavMs: 2500,
      minDelayMs: 220,
      autoCloseMs: 4000,
      betweenPopupsMs: 1000,
    }),
    [],
  );

  const form = useForm<PageNudgeForm>({
    resolver: zodResolver(PageNudgeSchema) as any,
    defaultValues: defaults,
  });

  function openCreate() {
    setEditingId(null);
    form.reset(defaults);
    setDialogOpen(true);
  }

  function openEdit(doc: any) {
    setEditingId(String(doc._id));
    form.reset({
      id: String(doc._id),
      name: doc.name ?? "",
      active: !!doc.active,
      pathPrefix: doc.rules?.pathPrefix ?? "/",
      pathMode: doc.rules?.pathMode ?? "prefix",
      suggestion1: doc.suggestions?.suggestion1 ?? "",
      suggestion2: doc.suggestions?.suggestion2 ?? "",
      suggestion3: doc.suggestions?.suggestion3 ?? "",
      sequenceCount: doc.settings?.sequenceCount ?? 3,
      showDelayAfterNavMs: doc.settings?.showDelayAfterNavMs ?? 2500,
      minDelayMs: doc.settings?.minDelayMs ?? 220,
      autoCloseMs: doc.settings?.autoCloseMs ?? 4000,
      betweenPopupsMs: doc.settings?.betweenPopupsMs ?? 1000,
    });
    setDialogOpen(true);
  }

  async function onSubmit(values: PageNudgeForm) {
    try {
      await upsert({
        _id: (values.id as any) || undefined,
        name: values.name,
        active: values.active,
        rules: {
          pathPrefix: values.pathPrefix?.trim() || undefined,
          pathMode: values.pathMode,
        },
        suggestions: {
          suggestion1: cleanSuggestion(values.suggestion1),
          suggestion2: cleanSuggestion(values.suggestion2),
          suggestion3: cleanSuggestion(values.suggestion3),
        },
        settings: {
          sequenceCount: values.sequenceCount,
          showDelayAfterNavMs: values.showDelayAfterNavMs,
          minDelayMs: values.minDelayMs,
          autoCloseMs: values.autoCloseMs,
          betweenPopupsMs: values.betweenPopupsMs,
        },
      });
      toast.success("Page nudge saved");
      setDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save page nudge");
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div>
          <CardTitle>Page-based Nudge (Starter)</CardTitle>
          <div className="mt-1 text-sm text-muted-foreground">
            Choose exactly 3 suggestion nudges to show in sequence on a specific page.
          </div>
        </div>
        <Button size="sm" onClick={openCreate}>
          New page nudge
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {list.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No page nudges yet. Create one to target your homepage or product pages.
          </div>
        ) : null}

        {list.map((doc: any) => {
          const pathMode = doc.rules?.pathMode ?? "prefix";
          const pathPrefix = doc.rules?.pathPrefix ?? "/";
          const s = [
            doc.suggestions?.suggestion1,
            doc.suggestions?.suggestion2,
            doc.suggestions?.suggestion3,
          ].filter(Boolean);

          return (
            <div key={doc._id} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-semibold">{doc.name || "Untitled"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Target: <span className="font-medium">{pathMode}</span>{" "}
                    <span className="font-medium">{pathPrefix}</span>
                  </div>
                  {s.length ? (
                    <div className="mt-2 text-sm">
                      {s.slice(0, 3).map((x: string, i: number) => (
                        <div key={i} className="text-muted-foreground">
                          {i + 1}. {x}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-muted-foreground">
                      No suggestions configured
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(doc)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      if (!confirm("Delete this page nudge?")) return;
                      try {
                        await remove({ _id: doc._id });
                        toast.success("Deleted");
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

              <Separator className="my-3" />
              <div className="text-xs text-muted-foreground">
                Sequence count:{" "}
                <span className="font-medium">
                  {doc.settings?.sequenceCount ?? 3}
                </span>{" "}
                · show after nav:{" "}
                <span className="font-medium">
                  {doc.settings?.showDelayAfterNavMs ?? 2500}ms
                </span>
              </div>
            </div>
          );
        })}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <span />
          </DialogTrigger>
          <DialogContent className="w-full max-w-[95vw] sm:max-w-[900px] max-h-[85vh] overflow-hidden p-0">
            <DialogHeader className="px-6 pb-2 pt-4">
              <DialogTitle className="text-base font-semibold">
                {editingId ? "Edit page nudge" : "Create page nudge"}
              </DialogTitle>
            </DialogHeader>

            <div className="px-6 pb-6 pt-0 space-y-5 overflow-y-auto max-h-[calc(85vh-64px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input {...form.register("name")} placeholder="Homepage release nudge" />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center justify-between gap-3">
                    <span>Active</span>
                    <Switch
                      checked={form.watch("active")}
                      onCheckedChange={(v) => form.setValue("active", v)}
                    />
                  </Label>
                  <div className="text-xs text-muted-foreground">
                    Turn off to hide this sequence on the targeted page.
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Path mode</Label>
                  <Select
                    value={form.watch("pathMode") ?? "prefix"}
                    onValueChange={(v) => form.setValue("pathMode", v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="prefix" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prefix">prefix</SelectItem>
                      <SelectItem value="exact">exact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Path prefix</Label>
                  <Input
                    {...form.register("pathPrefix")}
                    placeholder="/ (all pages) /pricing /"
                  />
                  <div className="text-xs text-muted-foreground">
                    Use <span className="font-medium">exact</span> to target homepage only.
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Suggestion 1</Label>
                  <Input {...form.register("suggestion1")} placeholder="e.g., Product release" />
                </div>
                <div className="space-y-2">
                  <Label>Suggestion 2</Label>
                  <Input {...form.register("suggestion2")} placeholder="e.g., How the steps work" />
                </div>
                <div className="space-y-2">
                  <Label>Suggestion 3</Label>
                  <Input {...form.register("suggestion3")} placeholder="e.g., Pricing / demo call" />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sequence count</Label>
                  <Select
                    value={String(form.watch("sequenceCount") ?? 3)}
                    onValueChange={(v) => form.setValue("sequenceCount", Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="3" />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    Default is 3 popups (one suggestion per popup).
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>showDelayAfterNavMs</Label>
                  <Input
                    type="number"
                    {...form.register("showDelayAfterNavMs", { valueAsNumber: true })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>autoCloseMs</Label>
                  <Input type="number" {...form.register("autoCloseMs", { valueAsNumber: true })} />
                </div>

                <div className="space-y-2">
                  <Label>betweenPopupsMs</Label>
                  <Input
                    type="number"
                    {...form.register("betweenPopupsMs", { valueAsNumber: true })}
                  />
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                These timing values control when the nudge appears and how long each popup stays.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    void form.handleSubmit(onSubmit)();
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

