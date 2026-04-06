"use client";

import { useRef, useState, useEffect, useMemo, type RefObject, type ReactNode } from "react";
import { useForm, SubmitHandler, useFieldArray, type Control } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { Separator } from "@workspace/ui/components/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { toast } from "sonner";
import { cn } from "@workspace/ui/lib/utils";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  Film,
  GripVertical,
  Layers,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

const MAX_PROMO_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PROMO_VIDEO_BYTES = 50 * 1024 * 1024;

/** Surface Convex / network errors in toasts (bundler may wrap `ConvexError`). */
function promoSaveErrorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const data = (err as { data?: { message?: string; code?: string } }).data;
    if (data?.message && typeof data.message === "string") {
      return data.message.length > 220 ? `${data.message.slice(0, 220)}…` : data.message;
    }
  }
  const msg =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: string }).message)
      : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("payment_required") || lower.includes("subscription is required")) {
    return "An active plan or trial is required to save promos.";
  }
  if (lower.includes("unauthorized") || lower.includes("organization not found")) {
    return "You must be signed in with an organization to save promos.";
  }
  if (msg.includes("Server Error") && msg.length < 40) {
    return "Could not save (server rejected the request). Check Convex logs or your org plan status.";
  }
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
}

/** After react-hook-form `move(from, to)` on the step array, fix the selected storyboard index. */
function adjustSelectedIndexAfterMove(selected: number, from: number, to: number): number {
  if (selected === from) return to;
  if (from < to) {
    if (selected > from && selected <= to) return selected - 1;
  } else if (from > to) {
    if (selected >= to && selected < from) return selected + 1;
  }
  return selected;
}

/** Default buttons when a sequence nudge has none configured (save + new steps). */
/** Client-side filter on promo list (name, path, headline, body snippet). */
function promoDocMatchesSearch(
  p: {
    name?: string;
    rules?: { pathPrefix?: string; pathMode?: string };
    card?: { title?: string; body?: string };
  },
  query: string,
) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const parts = [p.name, p.rules?.pathPrefix, p.rules?.pathMode, p.card?.title, p.card?.body]
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .map((x) => x.toLowerCase());
  return parts.some((s) => s.includes(q));
}

const DEFAULT_NUDGE_CTAS: Array<{
  kind: "open_chat" | "open_booking";
  label: string;
  url?: string;
}> = [
  { kind: "open_chat", label: "Chat with AI Assistant", url: "" },
  { kind: "open_booking", label: "Book a meeting", url: "" },
];

const MAX_NUDGE_CONTENT_BLOCKS = 8;

function newNudgeContentBlockId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return `b_${Math.random().toString(36).slice(2, 12)}`;
}

const nudgeBlockIdZ = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);

const nudgeBlockUrlZ = z.string().max(2048).refine((s) => {
  try {
    const u = new URL(s.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}, "Must be an http(s) URL");

const nudgeTextAlignZ = z.enum(["left", "center", "right"]).optional();

const nudgeContentBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    id: nudgeBlockIdZ,
    text: z.string().max(1500),
    align: nudgeTextAlignZ,
  }),
  z.object({
    type: z.literal("image"),
    id: nudgeBlockIdZ,
    url: nudgeBlockUrlZ,
  }),
  z.object({
    type: z.literal("video"),
    id: nudgeBlockIdZ,
    url: nudgeBlockUrlZ,
  }),
]);

const contentBlocksFieldSchema = z.array(nudgeContentBlockSchema).max(MAX_NUDGE_CONTENT_BLOCKS).optional();

const PromoSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  active: z.boolean(),
  showNudge: z.boolean().optional(),

  // ✅ simplified targeting
  pathPrefix: z.string().optional(),
  pathMode: z.enum(["prefix", "exact"]).optional(),

  title: z.string(),
  body: z.string(),
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  /** Host-page nudge width tier (single nudge or when no sequence steps). */
  nudgeSize: z.enum(["sm", "md", "lg", "xl"]).optional(),
  /** Image/video area height tier (independent of width). */
  mediaHeight: z.enum(["compact", "standard", "tall", "hero"]).optional(),
  /** Image/video position relative to text. */
  mediaPlacement: z
    .enum(["top", "bottom", "left", "right", "framed"])
    .optional(),
  /** Ordered text/image/video blocks; when set, replaces body + single media on the host (plain text + http(s) URLs only). */
  contentBlocks: contentBlocksFieldSchema,
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
  animationPreset: z
    .enum(["soft_slide", "ppt_pop", "cinematic", "none"])
    .optional(),

  /** After the last nudge, restart the sequence until the visitor dismisses. */
  sequenceLoop: z.boolean().optional(),
  /** Shuffle nudge order when showing the sequence on the host page. */
  sequenceRandomOrder: z.boolean().optional(),

  sequenceSteps: z
    .array(
      z.object({
        title: z.string().optional(),
        body: z.string().optional(),
        imageUrl: z.string().optional(),
        videoUrl: z.string().optional(),
        ctas: z
          .array(
            z.object({
              kind: z.enum(["open_chat", "open_booking", "open_url"]),
              label: z.string().min(1),
              url: z.string().optional(),
            }),
          )
          .optional(),
        ctaEmphasisMode: z
          .enum(["first_primary", "last_primary", "all_primary", "none_primary"])
          .optional(),
        nudgeSize: z.enum(["sm", "md", "lg", "xl"]).optional(),
        mediaHeight: z.enum(["compact", "standard", "tall", "hero"]).optional(),
        mediaPlacement: z
          .enum(["top", "bottom", "left", "right", "framed"])
          .optional(),
        contentBlocks: contentBlocksFieldSchema,
      }),
    )
    .max(10)
    .optional(),

  ctas: z
    .array(
      z.object({
        kind: z.enum(["open_chat", "open_booking", "open_url"]),
        label: z.string().min(1),
        url: z.string().optional(),
      }),
    )
    .optional(),
})
  .superRefine((data, ctx) => {
    const seqOn = data.sequenceEnabled !== false;
    const stepCount = data.sequenceSteps?.length ?? 0;

    if (seqOn) {
      if (stepCount === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Add at least one step (storyboard), or turn off Sequence.",
          path: ["sequenceSteps"],
        });
      }
      return;
    }

    if (!data.title.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Title is required",
        path: ["title"],
      });
    }
    if (!data.body.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Body is required",
        path: ["body"],
      });
    }
  });

type PromoForm = z.infer<typeof PromoSchema>;
type NudgeContentBlockForm = z.infer<typeof nudgeContentBlockSchema>;

function sanitizeContentBlocksForPersist(
  blocks: NudgeContentBlockForm[] | undefined,
): NudgeContentBlockForm[] | undefined {
  if (!blocks?.length) return undefined;
  const out: NudgeContentBlockForm[] = [];
  for (const b of blocks) {
    if (out.length >= MAX_NUDGE_CONTENT_BLOCKS) break;
    if (b.type === "text") {
      const t = b.text.trim();
      if (t) {
        const align = b.align === "center" || b.align === "right" ? b.align : undefined;
        out.push({ type: "text", id: b.id, text: t, ...(align ? { align } : {}) });
      }
    } else {
      const u = b.url.trim();
      try {
        const x = new URL(u);
        if (x.protocol !== "http:" && x.protocol !== "https:") continue;
        out.push({ ...b, url: u });
      } catch {
        continue;
      }
    }
  }
  return out.length ? out : undefined;
}

/** Live preview only: keep draft / in-progress URLs so layout (e.g. media left/right) updates immediately. */
function lenientContentBlocksForPreview(
  blocks: NudgeContentBlockForm[] | undefined,
): NudgeContentBlockForm[] {
  if (!blocks?.length) return [];
  const out: NudgeContentBlockForm[] = [];
  for (const b of blocks) {
    if (out.length >= MAX_NUDGE_CONTENT_BLOCKS) break;
    if (b.type === "text") {
      const t = (b.text ?? "").trim();
      if (t) {
        const align = b.align === "center" || b.align === "right" ? b.align : undefined;
        out.push({ type: "text", id: b.id, text: t, ...(align ? { align } : {}) });
      }
    } else {
      const u = (b.url ?? "").trim();
      if (!/^https?:\/\//i.test(u)) continue;
      try {
        const x = new URL(u);
        if (x.protocol !== "http:" && x.protocol !== "https:") continue;
        out.push({ ...b, url: u });
      } catch {
        continue;
      }
    }
  }
  return out;
}

function normalizeContentBlocksFromApi(raw: unknown): NudgeContentBlockForm[] {
  if (!Array.isArray(raw)) return [];
  const out: NudgeContentBlockForm[] = [];
  for (const b of raw) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) continue;
    if (o.type === "text" && typeof o.text === "string") {
      const alignRaw = o.align;
      const align =
        alignRaw === "center" || alignRaw === "right" || alignRaw === "left"
          ? alignRaw
          : undefined;
      out.push({
        type: "text",
        id,
        text: o.text.slice(0, 1500),
        ...(align && align !== "left" ? { align } : {}),
      });
    } else if (o.type === "image" && typeof o.url === "string") {
      out.push({ type: "image", id, url: o.url.slice(0, 2048) });
    } else if (o.type === "video" && typeof o.url === "string") {
      out.push({ type: "video", id, url: o.url.slice(0, 2048) });
    }
    if (out.length >= MAX_NUDGE_CONTENT_BLOCKS) break;
  }
  return out;
}

function PromoNudgeContentBlocksFields({
  watch,
  setValue,
  name,
  stepImageUrl,
  stepVideoUrl,
}: {
  watch: ReturnType<typeof useForm<PromoForm>>["watch"];
  setValue: ReturnType<typeof useForm<PromoForm>>["setValue"];
  name: "contentBlocks" | `sequenceSteps.${number}.contentBlocks`;
  stepImageUrl?: string;
  stepVideoUrl?: string;
}) {
  const blocks = (watch(name as never) ?? []) as NudgeContentBlockForm[];
  const setBlocks = (next: NudgeContentBlockForm[]) => {
    setValue(name as never, next as never, { shouldDirty: true });
  };

  const imgHint = (stepImageUrl ?? "").trim();
  const vidHint = (stepVideoUrl ?? "").trim();

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Structured content (optional)</p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Stack paragraphs and media in order. Plain text only (no HTML); use Paragraph → Alignment for center/right.
        Image/video blocks need{" "}
        <span className="font-medium">https</span> URLs. When you add blocks, they replace the classic body + single
        media on the site. With <span className="font-medium">exactly one</span> image or video block,{" "}
        <span className="font-medium">Media left / right</span> in Layout places it beside the text (same as the
        embedded nudge). Use <span className="font-medium">Content panel</span> for a framed stack.
      </p>

      <div className="mt-3 space-y-2">
        {blocks.map((block, idx) => (
          <div
            key={block.id}
            className="rounded-lg border border-slate-200/90 bg-white p-2 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase text-slate-500">
                {block.type === "text" ? "Paragraph" : block.type === "image" ? "Image URL" : "Video URL"}
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={idx === 0}
                  title="Move up"
                  onClick={() => {
                    const next = [...blocks];
                    [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
                    setBlocks(next);
                  }}
                >
                  <ChevronUp className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={idx >= blocks.length - 1}
                  title="Move down"
                  onClick={() => {
                    const next = [...blocks];
                    [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
                    setBlocks(next);
                  }}
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  title="Remove block"
                  onClick={() => setBlocks(blocks.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
            {block.type === "text" ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-[10px] font-medium text-muted-foreground">Alignment</Label>
                  <Select
                    value={block.align ?? "left"}
                    onValueChange={(v) => {
                      const next = blocks.map((b, i) =>
                        i === idx && b.type === "text"
                          ? {
                              ...b,
                              align: v as "left" | "center" | "right",
                            }
                          : b,
                      );
                      setBlocks(next);
                    }}
                  >
                    <SelectTrigger className="h-8 w-[140px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  rows={3}
                  className="text-sm"
                  value={block.text}
                  onChange={(e) => {
                    const next = blocks.map((b, i) =>
                      i === idx ? { ...b, text: e.target.value } : b,
                    );
                    setBlocks(next);
                  }}
                  placeholder="Short paragraph…"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Input
                  className="h-8 truncate font-mono text-[11px] leading-tight"
                  value={block.url}
                  title={block.url || undefined}
                  onChange={(e) => {
                    const next = blocks.map((b, i) =>
                      i === idx ? { ...b, url: e.target.value } : b,
                    );
                    setBlocks(next);
                  }}
                  placeholder="https://…"
                />
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Visitors only see the video or image — not this address. Long URLs (e.g. after upload) are normal;
                  they are not shown on your site.
                </p>
                {block.type === "image" && imgHint ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px]"
                    onClick={() => {
                      const next = blocks.map((b, i) =>
                        i === idx ? { ...b, url: imgHint } : b,
                      );
                      setBlocks(next);
                    }}
                  >
                    Use this step’s image URL
                  </Button>
                ) : null}
                {block.type === "video" && vidHint ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px]"
                    onClick={() => {
                      const next = blocks.map((b, i) =>
                        i === idx ? { ...b, url: vidHint } : b,
                      );
                      setBlocks(next);
                    }}
                  >
                    Use this step’s video URL
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={blocks.length >= MAX_NUDGE_CONTENT_BLOCKS}
          onClick={() =>
            setBlocks([...blocks, { type: "text", id: newNudgeContentBlockId(), text: "" }])
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          Paragraph
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={blocks.length >= MAX_NUDGE_CONTENT_BLOCKS}
          onClick={() =>
            setBlocks([...blocks, { type: "image", id: newNudgeContentBlockId(), url: "" }])
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          Image URL
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={blocks.length >= MAX_NUDGE_CONTENT_BLOCKS}
          onClick={() =>
            setBlocks([...blocks, { type: "video", id: newNudgeContentBlockId(), url: "" }])
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          Video URL
        </Button>
      </div>
    </div>
  );
}

const NUDGE_SIZE_OPTIONS: { value: NonNullable<PromoForm["nudgeSize"]>; label: string }[] = [
  { value: "sm", label: "Compact" },
  { value: "md", label: "Standard" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Highlight" },
];

const MEDIA_PLACEMENT_OPTIONS: {
  value: NonNullable<PromoForm["mediaPlacement"]>;
  label: string;
}[] = [
  { value: "top", label: "Media above text" },
  { value: "bottom", label: "Media below text" },
  { value: "left", label: "Media left" },
  { value: "right", label: "Media right" },
  {
    value: "framed",
    label: "Content panel (body + media in a light box)",
  },
];

const MEDIA_HEIGHT_OPTIONS: {
  value: NonNullable<PromoForm["mediaHeight"]>;
  label: string;
}[] = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "tall", label: "Tall" },
  { value: "hero", label: "Hero" },
];

/** Base media strip height per width tier — must stay in sync with `embed.ts` nudgeLayoutSpec.mediaH. */
const NUDGE_SIZE_MEDIA_BASE_PX: Record<NonNullable<PromoForm["nudgeSize"]>, number> = {
  sm: 88,
  md: 112,
  lg: 140,
  xl: 200,
};

function previewMediaHeightPx(
  nudgeSize: PromoForm["nudgeSize"] | undefined,
  mediaHeight: PromoForm["mediaHeight"] | undefined,
): number {
  const base = NUDGE_SIZE_MEDIA_BASE_PX[nudgeSize ?? "md"];
  const h = mediaHeight ?? "standard";
  const mult =
    h === "compact" ? 0.72 : h === "standard" ? 1 : h === "tall" ? 1.38 : 1.85;
  return Math.max(56, Math.round(base * mult));
}

/** Preview card max width in the editor (can be wider than the embed for a roomier live preview). */
const NUDGE_PREVIEW_MAX_CLASS: Record<NonNullable<PromoForm["nudgeSize"]>, string> = {
  sm: "max-w-[18rem]",
  md: "max-w-[22rem]",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

/** Same pixel widths as `embed.ts` `nudgeLayoutSpec.splitMediaW` — preview must match production. */
const SPLIT_MEDIA_W_PX: Record<NonNullable<PromoForm["nudgeSize"]>, number> = {
  sm: 100,
  md: 120,
  lg: 140,
  xl: 160,
};

function previewSideMediaAspectRatio(
  mediaHeight: PromoForm["mediaHeight"] | undefined,
): string {
  const h = mediaHeight ?? "standard";
  if (h === "compact") return "1 / 1";
  if (h === "standard") return "4 / 5";
  if (h === "tall") return "3 / 4";
  return "9 / 16";
}

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

function formatDuration(ms: number) {
  const safe = Math.max(0, Number(ms || 0));
  if (safe >= 60_000) {
    const mins = safe / 60_000;
    return `${Number.isInteger(mins) ? mins.toFixed(0) : mins.toFixed(1)} min`;
  }
  const secs = safe / 1000;
  return `${Number.isInteger(secs) ? secs.toFixed(0) : secs.toFixed(1)} s`;
}

const ANIM_LABEL: Record<string, string> = {
  soft_slide: "Soft slide",
  ppt_pop: "PPT pop",
  cinematic: "Cinematic",
  none: "None",
};

function MediaUploadOnly({
  label,
  hint,
  value,
  uploading,
  accept,
  inputId,
  onPick,
  onClear,
  fileInputRef,
}: {
  label: string;
  hint: string;
  value: string;
  uploading: boolean;
  accept: string;
  inputId: string;
  onPick: (file: File | undefined, inputEl: HTMLInputElement | null) => void | Promise<void>;
  onClear: () => void;
  fileInputRef?: RefObject<HTMLInputElement | null>;
}) {
  const has = !!value?.trim();
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="hidden"
          id={inputId}
          onChange={(e) => void onPick(e.target.files?.[0], e.target)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={uploading}
          onClick={() => document.getElementById(inputId)?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Upload className="mr-1 h-3.5 w-3.5" aria-hidden />
          )}
          {uploading ? "Uploading…" : has ? "Replace" : "Upload"}
        </Button>
        {has ? (
          <>
            <span className="max-w-[160px] truncate text-xs text-muted-foreground">Media attached</span>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onClear}>
              Remove
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">No file</span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function SequenceStepCtaFields({
  stepIndex,
  control,
  register,
  watch,
  setValue,
  emphasisFallback,
}: {
  stepIndex: number;
  control: Control<PromoForm>;
  register: ReturnType<typeof useForm<PromoForm>>["register"];
  watch: ReturnType<typeof useForm<PromoForm>>["watch"];
  setValue: ReturnType<typeof useForm<PromoForm>>["setValue"];
  emphasisFallback: PromoForm["ctaEmphasisMode"];
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `sequenceSteps.${stepIndex}.ctas` as any,
  });

  const stepEmphasis =
    watch(`sequenceSteps.${stepIndex}.ctaEmphasisMode` as const) ?? emphasisFallback ?? "first_primary";
  const len = fields.length;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label className="text-xs font-medium">Buttons for this step</Label>
          <p className="text-[11px] text-muted-foreground">
            Per-nudge CTAs. Add, remove, and set which one is primary.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => append({ kind: "open_chat", label: "New button", url: "" })}
        >
          Add button
        </Button>
      </div>

      {len > 0 ? (
        <div className="rounded-md bg-background px-2 py-2 text-[11px]">
          <p className="mb-2 font-medium text-slate-700">Emphasis on this step</p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { k: "first_primary", label: "First primary" },
                { k: "last_primary", label: "Last primary" },
                { k: "all_primary", label: "All primary" },
                { k: "none_primary", label: "None primary" },
              ] as const
            ).map((opt) => (
              <Button
                key={opt.k}
                type="button"
                size="sm"
                variant={stepEmphasis === opt.k ? "default" : "outline"}
                className="h-7 rounded-full px-2.5 text-[10px]"
                onClick={() =>
                  setValue(`sequenceSteps.${stepIndex}.ctaEmphasisMode` as const, opt.k, {
                    shouldDirty: true,
                  })
                }
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {fields.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            At least one button is required — use “Add button” or save to apply chat + book defaults.
          </p>
        ) : null}
        {fields.map((field, ctaIdx) => (
          <div key={field.id} className="space-y-2 rounded-md border bg-background p-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase text-slate-600">
                Button {ctaIdx + 1}
                {isPrimaryButton(stepEmphasis, ctaIdx, len) ? (
                  <span className="ml-2 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium text-sky-800">
                    Primary
                  </span>
                ) : null}
              </span>
              {len > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={() => remove(ctaIdx)}
                >
                  Remove
                </Button>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-[10px]">Type</Label>
                <Select
                  value={watch(`sequenceSteps.${stepIndex}.ctas.${ctaIdx}.kind` as const) || "open_chat"}
                  onValueChange={(v) =>
                    setValue(
                      `sequenceSteps.${stepIndex}.ctas.${ctaIdx}.kind` as const,
                      v as "open_chat" | "open_booking" | "open_url",
                      { shouldDirty: true },
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
              <div>
                <Label className="text-[10px]">Label</Label>
                <Input
                  className="h-8 text-xs"
                  {...register(`sequenceSteps.${stepIndex}.ctas.${ctaIdx}.label` as const)}
                  placeholder="Button label"
                />
              </div>
            </div>
            {watch(`sequenceSteps.${stepIndex}.ctas.${ctaIdx}.kind` as const) === "open_url" ? (
              <div>
                <Label className="text-[10px]">URL</Label>
                <Input
                  className="h-8 text-xs"
                  {...register(`sequenceSteps.${stepIndex}.ctas.${ctaIdx}.url` as const)}
                  placeholder="https://…"
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function PromoSequenceStoryboard({
  sequenceEnabled,
  sequenceSteps,
  stepRowIds,
  showDelayMs,
  autoCloseMs,
  betweenMs,
  animationPreset,
  baseVideoUrl,
  baseImageUrl,
  baseTitle,
  onAppendStep,
  selectedPreviewIndex,
  onSelectNudgeIndex,
  onReorderSteps,
  sequenceRandomOrder,
  onSequenceRandomOrderChange,
}: {
  sequenceEnabled: boolean;
  sequenceSteps: Array<{
    title?: string;
    body?: string;
    imageUrl?: string;
    videoUrl?: string;
  }>;
  /** Stable keys from `useFieldArray` — avoids broken drag/drop after reorder. */
  stepRowIds: string[];
  showDelayMs: number;
  autoCloseMs: number;
  betweenMs: number;
  animationPreset: string;
  baseVideoUrl: string;
  baseImageUrl: string;
  baseTitle: string;
  onAppendStep: () => void;
  selectedPreviewIndex: number;
  onSelectNudgeIndex: (i: number) => void;
  onReorderSteps?: (fromIndex: number, toIndex: number) => void;
  sequenceRandomOrder: boolean;
  onSequenceRandomOrderChange: (v: boolean) => void;
}) {
  /** Pointer-based reorder (works in scrollable storyboard; HTML5 drag is unreliable here). */
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const dragFromRef = useRef<number | null>(null);
  const dropTargetRef = useRef<number | null>(null);
  dragFromRef.current = dragFrom;
  dropTargetRef.current = dropTarget;

  useEffect(() => {
    if (dragFrom === null) return;
    const finish = () => {
      const from = dragFromRef.current;
      const to = dropTargetRef.current;
      if (from !== null && to !== null && from !== to) {
        onReorderSteps?.(from, to);
      }
      setDragFrom(null);
      setDropTarget(null);
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [dragFrom, onReorderSteps]);

  useEffect(() => {
    if (dragFrom === null) return;
    const move = (e: PointerEvent) => {
      // Avoid horizontal scroll stealing the gesture inside overflow-x-auto.
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const zone = el?.closest("[data-nudge-drop-index]");
      if (zone) {
        const v = zone.getAttribute("data-nudge-drop-index");
        if (v !== null) {
          const idx = parseInt(v, 10);
          if (!Number.isNaN(idx)) {
            // Sync ref immediately: pointerup can fire before React re-renders from setState.
            dropTargetRef.current = idx;
            setDropTarget(idx);
          }
        }
      }
    };
    window.addEventListener("pointermove", move, { passive: false });
    return () => window.removeEventListener("pointermove", move);
  }, [dragFrom]);

  if (!sequenceEnabled) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center">
        <p className="text-sm font-medium text-slate-700">Single nudge</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sequence is off — visitors see this promo once per visit (then it closes).
        </p>
      </div>
    );
  }

  const hasStepRows = sequenceSteps.length > 0;
  /** Show every saved step in the editor (do not hide steps when maxSequenceItems lags). */
  const cardCount = hasStepRows ? Math.min(sequenceSteps.length, 10) : 1;
  const anim = ANIM_LABEL[animationPreset] ?? animationPreset;
  const canReorder = Boolean(onReorderSteps && hasStepRows && cardCount > 1);

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
        <div className="mb-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <Layers className="h-3.5 w-3.5 shrink-0 text-violet-500" aria-hidden />
              Storyboard
            </div>
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-medium text-violet-800">
              {anim}
            </span>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-violet-200/90 bg-violet-50/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Switch
                id="sequence-random-order"
                checked={sequenceRandomOrder}
                onCheckedChange={(v) => onSequenceRandomOrderChange(!!v)}
              />
              <Label
                htmlFor="sequence-random-order"
                className="cursor-pointer text-sm font-semibold leading-snug text-slate-900"
              >
                Random order on site
              </Label>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground sm:max-w-[55%] sm:text-right">
              Shuffles which nudge appears first on each page load (editor order is kept when this is off).
            </p>
          </div>

          {canReorder ? (
            <p className="flex flex-wrap items-center gap-2 text-[11px] text-violet-900">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 font-medium shadow-sm ring-1 ring-violet-200">
                <GripVertical className="h-4 w-4 text-violet-600" aria-hidden />
                Drag
              </span>
              <span className="text-muted-foreground">
                Press and hold the grip, move over another card or a <span className="font-medium">+pause</span> gap,
                then release to reorder — or use the <span className="font-medium">‹ ›</span> arrows on each card.
              </span>
            </p>
          ) : hasStepRows ? (
            <p className="text-[11px] text-muted-foreground">
              Add a second step to enable drag-and-drop reordering.
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            "flex items-stretch gap-1 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]",
            dragFrom !== null && "touch-none select-none",
          )}
          style={dragFrom !== null ? { touchAction: "none" } : undefined}
        >
          {/* T0 */}
          <div className="flex min-w-[88px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-3 text-center shadow-sm">
            <Clock className="h-4 w-4 text-slate-400" aria-hidden />
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Wait</span>
            <span className="text-sm font-semibold tabular-nums text-slate-900">{formatDuration(showDelayMs)}</span>
            <span className="text-[9px] leading-tight text-muted-foreground">after navigation</span>
          </div>

          <div className="flex shrink-0 items-center px-0.5 text-slate-300">
            <ChevronRight className="h-6 w-6" aria-hidden />
          </div>

          {Array.from({ length: cardCount }, (_, i) => {
            const step = hasStepRows ? sequenceSteps[i] : undefined;
            const vid = (step?.videoUrl?.trim() || baseVideoUrl).trim();
            const img = (step?.imageUrl?.trim() || baseImageUrl).trim();
            const titleShow = hasStepRows
              ? (step?.title?.trim() || "Title")
              : ((step?.title?.trim() || baseTitle).trim() || "Title");
            const rowKey = stepRowIds[i] ?? `nudge-${i}`;
            return (
              <div key={rowKey} className="flex shrink-0 items-stretch gap-1">
                <div
                  data-nudge-drop-index={i}
                  onPointerEnter={() => {
                    if (dragFrom !== null) {
                      dropTargetRef.current = i;
                      setDropTarget(i);
                    }
                  }}
                  onPointerMove={() => {
                    if (dragFrom !== null) {
                      dropTargetRef.current = i;
                      setDropTarget(i);
                    }
                  }}
                  className={cn(
                    "flex w-[158px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.04] transition hover:border-violet-200",
                    selectedPreviewIndex === i && "ring-2 ring-violet-500 ring-offset-2",
                    canReorder &&
                      dragFrom !== null &&
                      dropTarget === i &&
                      "ring-2 ring-violet-400 ring-offset-1",
                  )}
                >
                  <div className="flex items-stretch gap-0 border-b border-slate-100 bg-slate-50/80">
                    {canReorder ? (
                      <div
                        className={cn(
                          "flex w-11 shrink-0 cursor-grab touch-none select-none flex-col items-center justify-center border-r border-slate-200/80 bg-white text-slate-500 hover:bg-violet-50 hover:text-violet-800 active:cursor-grabbing",
                          dragFrom === i && "bg-violet-100 text-violet-800",
                        )}
                        title="Drag to reorder"
                        aria-label={`Reorder nudge ${i + 1}`}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          e.stopPropagation();
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          dropTargetRef.current = i;
                          setDragFrom(i);
                          setDropTarget(i);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="h-4 w-4" aria-hidden />
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="min-w-0 flex-1 px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100"
                      onClick={() => onSelectNudgeIndex(i)}
                    >
                      Nudge {i + 1}
                    </button>
                    {canReorder ? (
                      <div className="flex shrink-0 flex-col justify-center gap-0 border-l border-slate-200/80 bg-white py-0.5 pr-0.5">
                        <button
                          type="button"
                          className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-violet-50 hover:text-violet-800 disabled:pointer-events-none disabled:opacity-25"
                          title="Move earlier in sequence"
                          aria-label={`Move nudge ${i + 1} earlier in sequence`}
                          disabled={i === 0}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onReorderSteps?.(i, i - 1);
                          }}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-violet-50 hover:text-violet-800 disabled:pointer-events-none disabled:opacity-25"
                          title="Move later in sequence"
                          aria-label={`Move nudge ${i + 1} later in sequence`}
                          disabled={i >= cardCount - 1}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onReorderSteps?.(i, i + 1);
                          }}
                        >
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="w-full cursor-pointer border-0 bg-transparent p-0 text-left outline-none"
                    onClick={() => onSelectNudgeIndex(i)}
                  >
                    <div className="relative aspect-[16/10] bg-slate-100">
                      {vid ? (
                        <video
                          key={vid}
                          draggable={false}
                          className="h-full w-full object-cover"
                          src={vid}
                          muted
                          playsInline
                          loop
                          autoPlay
                          preload="metadata"
                        />
                      ) : img ? (
                        <img draggable={false} src={img} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
                          <Film className="h-6 w-6 text-slate-300" aria-hidden />
                          <span className="text-[9px] text-muted-foreground">
                            Upload per step below
                          </span>
                        </div>
                      )}
                      <div className="absolute bottom-1 right-1 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white">
                        {formatDuration(autoCloseMs)} on screen
                      </div>
                    </div>
                    <div className="space-y-0.5 px-2 py-2">
                      <p className="line-clamp-2 text-[11px] font-medium leading-snug text-slate-800">{titleShow}</p>
                      <p className="text-[9px] leading-tight text-muted-foreground">
                        {hasStepRows ? "This step’s title and media" : "Uses base message and media"}
                      </p>
                    </div>
                  </button>
                </div>

                {i < cardCount - 1 ? (
                  <div
                    data-nudge-drop-index={i + 1}
                    onPointerEnter={() => {
                      if (dragFrom !== null) {
                        dropTargetRef.current = i + 1;
                        setDropTarget(i + 1);
                      }
                    }}
                    onPointerMove={() => {
                      if (dragFrom !== null) {
                        dropTargetRef.current = i + 1;
                        setDropTarget(i + 1);
                      }
                    }}
                    className={cn(
                      "flex min-h-[120px] min-w-[64px] w-[64px] shrink-0 flex-col items-center justify-center gap-0.5 px-1",
                      canReorder && "rounded-lg border border-dashed border-transparent hover:border-violet-300 hover:bg-violet-50/40",
                      canReorder &&
                        dragFrom !== null &&
                        dropTarget === i + 1 &&
                        "border-violet-400 bg-violet-50/50",
                    )}
                    title={canReorder ? "Release here to insert between these nudges" : undefined}
                  >
                    <ArrowRight className="h-4 w-4 text-violet-400" aria-hidden />
                    <span className="rounded-md bg-violet-50 px-1.5 py-1 text-center text-[10px] font-semibold leading-tight text-violet-900">
                      +{formatDuration(betweenMs)}
                    </span>
                    <span className="text-[8px] text-muted-foreground">pause</span>
                  </div>
                ) : sequenceSteps.length < 10 ? (
                  <div className="flex w-10 shrink-0 items-center justify-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 rounded-full border-dashed text-muted-foreground hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                      title="Add another nudge with its own media"
                      onClick={onAppendStep}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ) : (
                  <div className="flex w-10 shrink-0 items-center justify-center">
                    <span className="text-[9px] font-medium text-muted-foreground">10 max</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">How it works:</span> each row in{" "}
        <span className="font-medium text-foreground">Step media</span> becomes one nudge in order (title, body, media,
        and buttons per step). Timing above applies between nudges. Multiple{" "}
        <span className="font-medium text-foreground">promos</span> that match the same URL still queue after this
        sequence.
        {sequenceRandomOrder ? (
          <>
            {" "}
            <span className="font-medium text-foreground">Random order</span> shuffles which nudge appears first on each
            page load (saved order below is still used when random is off).
          </>
        ) : null}
      </p>
    </div>
  );
}

export default function PromosPanel({ theme, brandLogoUrl }: PromosPanelProps) {
  const list = useQuery(api.private.promos.listByOrg, {});
  const upsert = useMutation(api.private.promos.upsert);
  const remove = useMutation(api.private.promos.remove);
  const addFile = useAction(api.private.files.addFile);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<PromoForm>({
    resolver: zodResolver(PromoSchema),
    defaultValues: {
      name: "Dual CTA • Chat or Book",
      active: true,
      showNudge: true,
      title: "Get help fast or schedule time",
      body: "Talk to the assistant now or book a 15-min demo.",
      imageUrl: "",
      videoUrl: "",
      pathPrefix: "/",
      pathMode: "prefix", // "/" + prefix = all pages
      identityMode: "auto",
      ctaEmphasisMode: "first_primary",
      sequenceEnabled: true,
      showDelayAfterNavMs: 2500,
      autoCloseMs: 4500,
      betweenPopupsMs: 10000,
      maxSequenceItems: 3,
      animationPreset: "soft_slide",
      sequenceLoop: false,
      sequenceRandomOrder: false,
      sequenceSteps: [],
      nudgeSize: "md",
      mediaHeight: "standard",
      mediaPlacement: "bottom",
      contentBlocks: [],
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

  const {
    fields: sequenceStepFields,
    append: appendSequenceStep,
    remove: removeSequenceStep,
    move: moveSequenceStep,
  } = useFieldArray({
    control: form.control,
    name: "sequenceSteps",
  });

  const [uploadingStepKey, setUploadingStepKey] = useState<string | null>(null);
  /** Storyboard nudge index — drives the right-hand preview when sequence has steps. */
  const [storyPreviewIndex, setStoryPreviewIndex] = useState(0);
  const [promoListSearch, setPromoListSearch] = useState("");

  useEffect(() => {
    if (dialogOpen) setStoryPreviewIndex(0);
  }, [dialogOpen]);

  const filteredPromoList = useMemo(() => {
    if (!list?.length) return [];
    return list.filter((p) => promoDocMatchesSearch(p, promoListSearch));
  }, [list, promoListSearch]);

  const handlePromoMediaUpload = async (
    file: File | undefined,
    role: "image" | "video",
    setUploading: (v: boolean) => void,
    setField: (url: string) => void,
    inputRef: RefObject<HTMLInputElement | null>,
  ) => {
    if (!file) return;
    const max = role === "video" ? MAX_PROMO_VIDEO_BYTES : MAX_PROMO_IMAGE_BYTES;
    if (file.size > max) {
      toast.error(`File too large (max ${max / (1024 * 1024)}MB)`);
      return;
    }
    try {
      setUploading(true);
      const bytes = await file.arrayBuffer();
      const res = await addFile({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes,
        kind: "promo_media",
        promoMediaRole: role,
      });
      const url = (res as { url?: string })?.url;
      if (!url) {
        toast.error("Upload failed (no URL returned)");
        return;
      }
      setField(url);
      toast.success(role === "video" ? "Video uploaded" : "Image uploaded");
    } catch (e) {
      console.error(e);
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleSequenceStepMediaUpload = async (
    file: File | undefined,
    index: number,
    role: "image" | "video",
    inputEl: HTMLInputElement | null,
  ) => {
    if (!file) return;
    const max = role === "video" ? MAX_PROMO_VIDEO_BYTES : MAX_PROMO_IMAGE_BYTES;
    if (file.size > max) {
      toast.error(`File too large (max ${max / (1024 * 1024)}MB)`);
      return;
    }
    const key = `${index}-${role}`;
    try {
      setUploadingStepKey(key);
      const bytes = await file.arrayBuffer();
      const res = await addFile({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes,
        kind: "promo_media",
        promoMediaRole: role,
      });
      const url = (res as { url?: string })?.url;
      if (!url) {
        toast.error("Upload failed (no URL returned)");
        return;
      }
      const fieldName = role === "image" ? "imageUrl" : "videoUrl";
      form.setValue(`sequenceSteps.${index}.${fieldName}` as any, url, { shouldDirty: true });
      toast.success(role === "video" ? "Video uploaded" : "Image uploaded");
    } catch (e) {
      console.error(e);
      toast.error("Upload failed");
    } finally {
      setUploadingStepKey(null);
      if (inputEl) inputEl.value = "";
    }
  };

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
      imageUrl: form.getValues("imageUrl") ?? "",
      videoUrl: form.getValues("videoUrl") ?? "",
      pathPrefix: form.getValues("pathPrefix") || "/",
      pathMode: form.getValues("pathMode") ?? "prefix",
      identityMode: form.getValues("identityMode") ?? "auto",
      ctaEmphasisMode: form.getValues("ctaEmphasisMode") ?? "first_primary",
      sequenceEnabled: form.getValues("sequenceEnabled") ?? true,
      showDelayAfterNavMs: form.getValues("showDelayAfterNavMs") ?? 2500,
      autoCloseMs: form.getValues("autoCloseMs") ?? 4500,
      betweenPopupsMs: form.getValues("betweenPopupsMs") ?? 10000,
      maxSequenceItems: form.getValues("maxSequenceItems") ?? 3,
      animationPreset: form.getValues("animationPreset") ?? "soft_slide",
      sequenceLoop: form.getValues("sequenceLoop") ?? false,
      sequenceRandomOrder: form.getValues("sequenceRandomOrder") ?? false,
      sequenceSteps: form.getValues("sequenceSteps") ?? [],
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
      imageUrl: form.getValues("imageUrl") ?? "",
      videoUrl: form.getValues("videoUrl") ?? "",
      pathPrefix: form.getValues("pathPrefix") || "/",
      pathMode: form.getValues("pathMode") ?? "prefix",
      identityMode: form.getValues("identityMode") ?? "auto",
      ctaEmphasisMode: form.getValues("ctaEmphasisMode") ?? "first_primary",
      sequenceEnabled: form.getValues("sequenceEnabled") ?? true,
      showDelayAfterNavMs: form.getValues("showDelayAfterNavMs") ?? 2500,
      autoCloseMs: form.getValues("autoCloseMs") ?? 4500,
      betweenPopupsMs: form.getValues("betweenPopupsMs") ?? 10000,
      maxSequenceItems: form.getValues("maxSequenceItems") ?? 3,
      animationPreset: form.getValues("animationPreset") ?? "soft_slide",
      sequenceLoop: form.getValues("sequenceLoop") ?? false,
      sequenceRandomOrder: form.getValues("sequenceRandomOrder") ?? false,
      sequenceSteps: form.getValues("sequenceSteps") ?? [],
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

    const seqStepsRaw = values.sequenceSteps ?? [];
    const perNudgeLayout = (values.sequenceEnabled !== false) && seqStepsRaw.length > 0;

    let rawCtas =
      (values.ctas || []).filter((c) => c && c.label && c.label.trim().length > 0) || [];
    let mode = values.ctaEmphasisMode ?? "first_primary";

    if (perNudgeLayout) {
      const first = seqStepsRaw[0];
      const firstRow = (first?.ctas || []).filter((c) => c && c.label && c.label.trim().length > 0);
      rawCtas = (firstRow.length ? firstRow : DEFAULT_NUDGE_CTAS) as typeof rawCtas;
      mode = first?.ctaEmphasisMode ?? mode;
    }

    const ctaList = rawCtas.map((c) => ({
      kind: c.kind,
      label: c.label.trim(),
      url: c.kind === "open_url" ? c.url : undefined,
    }));

    const primaryIndex = getPrimaryIndex(mode, ctaList.length);

    const primaryCta =
      ctaList[primaryIndex] ||
      ({
        kind: "open_chat",
        label: "Chat with AI Assistant",
      } as const);

    const secondaryCta =
      ctaList.length > 1 ? ctaList.find((_, idx) => idx !== primaryIndex) : undefined;

    const maxSeq = Math.min(10, Math.max(values.maxSequenceItems ?? 3, seqStepsRaw.length));

    const firstStep = seqStepsRaw[0];
    const cardTitle =
      perNudgeLayout && firstStep
        ? (firstStep.title?.trim() || "")
        : values.title;
    const cardBody =
      perNudgeLayout && firstStep
        ? (firstStep.body?.trim() || "")
        : values.body;

    const seqStepsPersist = seqStepsRaw.map((step) => {
      const rowCtasRaw = (step.ctas || []).filter((c) => c && c.label && c.label.trim().length > 0);
      const rowCtas = perNudgeLayout
        ? rowCtasRaw.length > 0
          ? rowCtasRaw
          : DEFAULT_NUDGE_CTAS
        : rowCtasRaw;

      const row: {
        title?: string;
        body?: string;
        imageUrl?: string;
        videoUrl?: string;
        ctaList?: { kind: "open_chat" | "open_booking" | "open_url"; label: string; url?: string }[];
        ctaEmphasisMode?: PromoForm["ctaEmphasisMode"];
        nudgeSize?: PromoForm["nudgeSize"];
        mediaHeight?: PromoForm["mediaHeight"];
        mediaPlacement?: PromoForm["mediaPlacement"];
        contentBlocks?: NudgeContentBlockForm[];
      } = {
        title: step.title?.trim() || undefined,
        body: step.body?.trim() || undefined,
        imageUrl: step.imageUrl?.trim() || undefined,
        videoUrl: step.videoUrl?.trim() || undefined,
        nudgeSize: step.nudgeSize ?? undefined,
        mediaHeight: step.mediaHeight ?? undefined,
        mediaPlacement: step.mediaPlacement ?? undefined,
        contentBlocks: sanitizeContentBlocksForPersist(
          step.contentBlocks as NudgeContentBlockForm[] | undefined,
        ),
      };

      if (rowCtas.length > 0) {
        row.ctaList = rowCtas.map((c) => ({
          kind: c.kind,
          label: c.label.trim(),
          url: c.kind === "open_url" ? c.url : undefined,
        }));
        row.ctaEmphasisMode =
          step.ctaEmphasisMode ?? (perNudgeLayout ? "first_primary" : values.ctaEmphasisMode ?? "first_primary");
      }
      return row;
    });

    try {
      const promoId = typeof values.id === "string" && values.id.trim().length > 0 ? values.id.trim() : undefined;
      await upsert({
        _id: promoId as any,
        name: values.name,
        active: values.active,
        showNudge: values.showNudge ?? true,
        rules,
        card: {
          title: cardTitle,
          body: cardBody,
          imageUrl: perNudgeLayout ? undefined : values.imageUrl?.trim() || undefined,
          videoUrl: perNudgeLayout ? undefined : values.videoUrl?.trim() || undefined,
          nudgeSize: perNudgeLayout ? undefined : values.nudgeSize ?? undefined,
          mediaHeight: perNudgeLayout ? undefined : values.mediaHeight ?? undefined,
          mediaPlacement: perNudgeLayout ? undefined : values.mediaPlacement ?? undefined,
          contentBlocks: perNudgeLayout
            ? undefined
            : sanitizeContentBlocksForPersist(values.contentBlocks),
        },
        primaryCta,
        secondaryCta,
        identityMode: values.identityMode ?? "auto",
        ctaList: ctaList.length ? ctaList : undefined,
        ctaEmphasisMode: mode,
        settings: {
          sequenceEnabled: values.sequenceEnabled ?? true,
          sequenceLoop: values.sequenceLoop === true,
          sequenceRandomOrder: values.sequenceRandomOrder === true,
          showDelayAfterNavMs: values.showDelayAfterNavMs ?? 2500,
          autoCloseMs: values.autoCloseMs ?? 4500,
          betweenPopupsMs: values.betweenPopupsMs ?? 10000,
          maxSequenceItems: maxSeq,
          animationPreset: values.animationPreset ?? "soft_slide",
          sequenceSteps: seqStepsPersist.length > 0 ? seqStepsPersist : undefined,
        },
      } as any);

      toast.success("Promo saved");
      setDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast.error(promoSaveErrorMessage(e));
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
      imageUrl: "",
      videoUrl: "",
      pathPrefix: "/",
      pathMode: "prefix",
      identityMode: "auto",
      ctaEmphasisMode: "first_primary",
      sequenceEnabled: true,
      showDelayAfterNavMs: 2500,
      autoCloseMs: 4500,
      betweenPopupsMs: 10000,
      maxSequenceItems: 3,
      animationPreset: "soft_slide",
      sequenceLoop: false,
      sequenceRandomOrder: false,
      sequenceSteps: [],
      nudgeSize: "md",
      mediaHeight: "standard",
      mediaPlacement: "bottom",
      contentBlocks: [],
      ctas: [
        { kind: "open_chat", label: "Chat with AI Assistant", url: "" },
        { kind: "open_booking", label: "Book a meeting", url: "" },
      ],
    });
    setStoryPreviewIndex(0);
    setDialogOpen(true);
  }

  function openForEdit(p: any) {
    const sequenceStepsMapped = Array.isArray(p.settings?.sequenceSteps)
      ? p.settings.sequenceSteps.map((s: any) => ({
          title: s.title ?? "",
          body: s.body ?? "",
          imageUrl: s.imageUrl ?? "",
          videoUrl: s.videoUrl ?? "",
          ctas:
            Array.isArray(s.ctaList) && s.ctaList.length > 0
              ? s.ctaList.map((c: any) => ({
                  kind: c.kind,
                  label: c.label ?? "",
                  url: c.url ?? "",
                }))
              : [],
          ctaEmphasisMode: s.ctaEmphasisMode,
          nudgeSize: s.nudgeSize ?? "md",
          mediaHeight: s.mediaHeight ?? "standard",
          mediaPlacement: s.mediaPlacement ?? "bottom",
          contentBlocks: normalizeContentBlocksFromApi(s.contentBlocks),
        }))
      : [];

    const useFirstNudgeForCard =
      sequenceStepsMapped.length > 0 && (p.settings?.sequenceEnabled !== false);

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
      title: useFirstNudgeForCard
        ? (sequenceStepsMapped[0]?.title || p.card?.title || "")
        : (p.card?.title ?? ""),
      body: useFirstNudgeForCard
        ? (sequenceStepsMapped[0]?.body || p.card?.body || "")
        : (p.card?.body ?? ""),
      imageUrl: p.card?.imageUrl ?? "",
      videoUrl: p.card?.videoUrl ?? "",
      pathPrefix: p.rules?.pathPrefix ?? "/",
      pathMode: (p.rules?.pathMode as "prefix" | "exact") ?? "prefix",
      identityMode: (p.identityMode as "auto" | "logo" | "avatars") ?? "auto",
      ctaEmphasisMode: (p.ctaEmphasisMode as PromoForm["ctaEmphasisMode"]) ?? "first_primary",
      // If saved steps exist, force sequence UI on (legacy promos had steps with sequence off).
      sequenceEnabled:
        sequenceStepsMapped.length > 0 ? true : (p.settings?.sequenceEnabled ?? true),
      showDelayAfterNavMs: p.settings?.showDelayAfterNavMs ?? 2500,
      autoCloseMs: p.settings?.autoCloseMs ?? 4500,
      betweenPopupsMs: p.settings?.betweenPopupsMs ?? 10000,
      maxSequenceItems: p.settings?.maxSequenceItems ?? 3,
      animationPreset: p.settings?.animationPreset ?? "soft_slide",
      sequenceLoop: p.settings?.sequenceLoop === true,
      sequenceRandomOrder: (p.settings as { sequenceRandomOrder?: boolean })?.sequenceRandomOrder === true,
      sequenceSteps: sequenceStepsMapped,
      nudgeSize: (p.card as { nudgeSize?: PromoForm["nudgeSize"] })?.nudgeSize ?? "md",
      mediaHeight: (p.card as { mediaHeight?: PromoForm["mediaHeight"] })?.mediaHeight ?? "standard",
      mediaPlacement:
        (p.card as { mediaPlacement?: PromoForm["mediaPlacement"] })?.mediaPlacement ?? "bottom",
      contentBlocks: normalizeContentBlocksFromApi(
        (p.card as { contentBlocks?: unknown })?.contentBlocks,
      ),
      ctas: ctasForForm,
    });

    setStoryPreviewIndex(0);
    setDialogOpen(true);
  }

  async function duplicatePromo(p: Record<string, unknown>) {
    try {
      const base = String(p.name ?? "Promo").trim() || "Promo";
      const rules = p.rules as { pathPrefix?: string; pathMode?: "prefix" | "exact" } | undefined;
      const card = p.card as {
        title?: string;
        body?: string;
        imageUrl?: string;
        videoUrl?: string;
      };
      await upsert({
        name: `${base} (copy)`,
        active: !!p.active,
        showNudge: p.showNudge !== false,
        rules: {
          pathPrefix: rules?.pathPrefix,
          pathMode: rules?.pathMode ?? "prefix",
        },
        card: {
          title: String(card?.title ?? ""),
          body: String(card?.body ?? ""),
          imageUrl: card?.imageUrl || undefined,
          videoUrl: card?.videoUrl || undefined,
          nudgeSize: (card as { nudgeSize?: PromoForm["nudgeSize"] })?.nudgeSize,
          mediaHeight: (card as { mediaHeight?: PromoForm["mediaHeight"] })?.mediaHeight,
          mediaPlacement: (card as { mediaPlacement?: PromoForm["mediaPlacement"] })
            ?.mediaPlacement,
          contentBlocks: (card as { contentBlocks?: NudgeContentBlockForm[] })?.contentBlocks,
        },
        primaryCta: p.primaryCta,
        secondaryCta: p.secondaryCta,
        identityMode: (p.identityMode as PromoForm["identityMode"]) ?? "auto",
        ctaList: p.ctaList as PromoForm["ctas"] | undefined,
        ctaEmphasisMode: p.ctaEmphasisMode as PromoForm["ctaEmphasisMode"],
        settings: p.settings
          ? {
              sequenceEnabled: (p.settings as { sequenceEnabled?: boolean }).sequenceEnabled,
              sequenceLoop: (p.settings as { sequenceLoop?: boolean }).sequenceLoop,
              sequenceRandomOrder: (p.settings as { sequenceRandomOrder?: boolean }).sequenceRandomOrder,
              showDelayAfterNavMs: (p.settings as { showDelayAfterNavMs?: number }).showDelayAfterNavMs,
              autoCloseMs: (p.settings as { autoCloseMs?: number }).autoCloseMs,
              betweenPopupsMs: (p.settings as { betweenPopupsMs?: number }).betweenPopupsMs,
              maxSequenceItems: (p.settings as { maxSequenceItems?: number }).maxSequenceItems,
              animationPreset: (p.settings as { animationPreset?: PromoForm["animationPreset"] })
                .animationPreset,
              sequenceSteps: (p.settings as { sequenceSteps?: PromoForm["sequenceSteps"] })
                .sequenceSteps,
            }
          : undefined,
      } as any);
      toast.success("Duplicated — open the copy to change page path or name");
    } catch (e) {
      console.error(e);
      toast.error(promoSaveErrorMessage(e));
    }
  }

  /* ----------------- Preview values ----------------- */

  const previewTitle = form.watch("title") || "Get help fast or schedule time";
  const previewBody = form.watch("body") || "Talk to the assistant now or book a 15-min demo.";
  const previewImageUrl = (form.watch("imageUrl") || "").trim();
  const previewVideoUrl = (form.watch("videoUrl") || "").trim();

  const rawPreviewCtas = form.watch("ctas") || [];
  const previewCtas = rawPreviewCtas.filter((c) => c && c.label && c.label.trim().length > 0);

  const identityMode = form.watch("identityMode") ?? "auto";
  const emphasisMode = form.watch("ctaEmphasisMode") ?? "first_primary";

  const pathMode = form.watch("pathMode") ?? "prefix";
  const pathPrefix = form.watch("pathPrefix") ?? "/";
  const sequenceEnabledWatch = form.watch("sequenceEnabled") ?? true;
  /** Storyboard + step editor + hide global message when sequence is on or at least one step row exists. */
  const sequenceUiEnabled =
    sequenceEnabledWatch || sequenceStepFields.length > 0;
  const showDelayWatch = Number(form.watch("showDelayAfterNavMs") ?? 2500);
  const autoCloseWatch = Number(form.watch("autoCloseMs") ?? 4500);
  const betweenWatch = Number(form.watch("betweenPopupsMs") ?? 10000);
  const sequenceCountWatch = Number(form.watch("maxSequenceItems") ?? 3);
  const animationPresetWatch = form.watch("animationPreset") ?? "soft_slide";
  const sequenceStepsWatch = form.watch("sequenceSteps") ?? [];
  const perNudgeLayout = sequenceUiEnabled && sequenceStepFields.length > 0;

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

  const stepCountForStory =
    sequenceUiEnabled && sequenceStepsWatch.length > 0 ? sequenceStepsWatch.length : 0;
  const clampedStoryIdx =
    stepCountForStory > 0 ? Math.min(Math.max(0, storyPreviewIndex), stepCountForStory - 1) : 0;

  const previewStepRow =
    sequenceUiEnabled && sequenceStepsWatch.length > 0
      ? sequenceStepsWatch[clampedStoryIdx]
      : undefined;
  const stepLocalCtas = (previewStepRow?.ctas || []).filter((c) => c?.label?.trim());
  const previewTitleEff =
    previewStepRow?.title?.trim() || (perNudgeLayout ? "" : previewTitle);
  const previewBodyEff =
    previewStepRow?.body?.trim() || (perNudgeLayout ? "" : previewBody);
  const previewImageEff =
    previewStepRow?.imageUrl?.trim() || (perNudgeLayout ? "" : previewImageUrl);
  const previewVideoEff =
    previewStepRow?.videoUrl?.trim() || (perNudgeLayout ? "" : previewVideoUrl);
  const previewCtasEff = perNudgeLayout
    ? stepLocalCtas.length > 0
      ? stepLocalCtas
      : DEFAULT_NUDGE_CTAS
    : stepLocalCtas.length > 0
      ? stepLocalCtas
      : effectivePreviewCtas;
  const previewEmphasisEff = perNudgeLayout
    ? stepLocalCtas.length > 0
      ? previewStepRow?.ctaEmphasisMode ?? emphasisMode
      : previewStepRow?.ctaEmphasisMode ?? "first_primary"
    : stepLocalCtas.length > 0
      ? previewStepRow?.ctaEmphasisMode ?? emphasisMode
      : emphasisMode;

  const previewNudgeSizeTier: NonNullable<PromoForm["nudgeSize"]> =
    (perNudgeLayout
      ? (previewStepRow as { nudgeSize?: PromoForm["nudgeSize"] } | undefined)?.nudgeSize
      : form.watch("nudgeSize")) ?? "md";

  const previewMediaHeightEff: NonNullable<PromoForm["mediaHeight"]> =
    (perNudgeLayout
      ? (previewStepRow as { mediaHeight?: PromoForm["mediaHeight"] } | undefined)?.mediaHeight
      : form.watch("mediaHeight")) ?? "standard";

  const previewMediaPlacementEff: NonNullable<PromoForm["mediaPlacement"]> =
    (perNudgeLayout
      ? (previewStepRow as { mediaPlacement?: PromoForm["mediaPlacement"] } | undefined)
          ?.mediaPlacement
      : form.watch("mediaPlacement")) ?? "bottom";

  const previewMediaPx = previewMediaHeightPx(previewNudgeSizeTier, previewMediaHeightEff);
  /** Match embed adaptive stack: min band + cap height (fraction of tier max). */
  const previewStackMediaMinPx = Math.max(48, Math.round(previewMediaPx * 0.32));

  /** Field-level watch so the preview updates when blocks change on the active story step. */
  const previewContentBlocksRaw = (
    perNudgeLayout
      ? (form.watch(`sequenceSteps.${clampedStoryIdx}.contentBlocks` as never) as
          | NudgeContentBlockForm[]
          | undefined)
      : form.watch("contentBlocks")
  ) as NudgeContentBlockForm[] | undefined;
  const previewBlocksEffective = lenientContentBlocksForPreview(previewContentBlocksRaw);
  /** Match embed: legacy upload + structured text blocks only → merge synthetic media into the stack. */
  const previewHasBlockMediaPre = previewBlocksEffective.some(
    (b) => b.type === "image" || b.type === "video",
  );
  let previewBlocksMerged = previewBlocksEffective;
  if (
    previewBlocksEffective.length > 0 &&
    !previewHasBlockMediaPre &&
    (previewVideoEff.trim() || previewImageEff.trim())
  ) {
    const u = (previewVideoEff.trim() || previewImageEff.trim()).trim();
    if (/^https?:\/\//i.test(u)) {
      const syn: NudgeContentBlockForm = previewVideoEff.trim()
        ? { type: "video", id: "legacy-media-preview", url: previewVideoEff.trim() }
        : { type: "image", id: "legacy-media-preview", url: previewImageEff.trim() };
      previewBlocksMerged =
        previewMediaPlacementEff === "top"
          ? [syn, ...previewBlocksEffective]
          : [...previewBlocksEffective, syn];
    }
  }

  const previewHasBlocks = previewBlocksMerged.length > 0;

  const previewBlockMediaBlocks = previewBlocksMerged.filter(
    (b): b is Extract<NudgeContentBlockForm, { type: "image" } | { type: "video" }> =>
      b.type === "image" || b.type === "video",
  );
  const previewHasBlockMedia = previewBlockMediaBlocks.length > 0;
  const previewSingleBlockMedia =
    previewBlockMediaBlocks.length === 1 ? previewBlockMediaBlocks[0] : undefined;

  const previewHasLegacyMedia = !!(previewVideoEff || previewImageEff);
  const previewHasAnyMedia = previewHasLegacyMedia || previewHasBlockMedia;
  /** Same resolution as `embed.ts`: no media → bottom; `framed` kept. Includes image/video blocks. */
  const previewPlacementResolved: NonNullable<PromoForm["mediaPlacement"]> =
    previewMediaPlacementEff === "framed"
      ? "framed"
      : !previewHasAnyMedia
        ? "bottom"
        : previewMediaPlacementEff;

  /** One image/video block + left/right → side column (matches embed `blocksUseSideBySide`). */
  const previewBlocksSideBySide =
    previewHasBlocks &&
    previewSingleBlockMedia != null &&
    (previewPlacementResolved === "left" || previewPlacementResolved === "right");

  /** Full-width strip: adaptive height (full media within min/max), same as embed. */
  const previewLegacyMediaStackEl = previewVideoEff ? (
    <div
      className="flex w-full items-center justify-center"
      style={{ minHeight: previewStackMediaMinPx, backgroundColor: nudgeBackgroundColor }}
    >
      <video
        key={previewVideoEff}
        className="block w-auto max-w-full object-contain object-center"
        style={{ maxHeight: previewMediaPx }}
        src={previewVideoEff}
        muted
        playsInline
        loop
        autoPlay
        preload="metadata"
      />
    </div>
  ) : previewImageEff ? (
    <div
      className="flex w-full items-center justify-center"
      style={{ minHeight: previewStackMediaMinPx, backgroundColor: nudgeBackgroundColor }}
    >
      <img
        className="block h-auto w-auto max-w-full object-contain object-center"
        style={{ maxHeight: previewMediaPx }}
        src={previewImageEff}
        alt="Promo media"
      />
    </div>
  ) : null;

  /** Side column: video full frame (`contain`); image `cover` centered — matches embed. */
  const previewLegacyMediaSideEl = previewVideoEff ? (
    <video
      key={`${previewVideoEff}-side`}
      className="absolute inset-0 block h-full w-full object-contain object-center"
      src={previewVideoEff}
      muted
      playsInline
      loop
      autoPlay
      preload="metadata"
    />
  ) : previewImageEff ? (
    <img
      key={`${previewImageEff}-side`}
      className="absolute inset-0 h-full w-full object-cover object-center"
      src={previewImageEff}
      alt="Promo media"
    />
  ) : null;

  const previewBlocksInner = previewBlocksMerged.map((b) =>
    b.type === "text" ? (
      <p
        key={b.id}
        className={cn(
          "whitespace-pre-wrap text-xs leading-relaxed text-slate-600",
          b.align === "center" && "text-center",
          b.align === "right" && "text-right",
        )}
      >
        {b.text}
      </p>
    ) : b.type === "image" ? (
      <div
        key={b.id}
        className="flex w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200/90"
        style={{ minHeight: previewStackMediaMinPx, backgroundColor: nudgeBackgroundColor }}
      >
        <img
          src={b.url}
          alt=""
          className="block h-auto w-auto max-w-full border-0 object-contain object-center"
          style={{ maxHeight: previewMediaPx }}
        />
      </div>
    ) : (
      <div
        key={b.id}
        className="flex w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200/90"
        style={{ minHeight: previewStackMediaMinPx, backgroundColor: nudgeBackgroundColor }}
      >
        <video
          className="block w-auto max-w-full border-0 object-contain object-center"
          style={{ maxHeight: previewMediaPx }}
          src={b.url}
          muted
          playsInline
          loop
          autoPlay
          preload="metadata"
        />
      </div>
    ),
  );

  const previewTextBlocksOnly = previewBlocksMerged.filter((b) => b.type === "text");
  const previewTextBlocksInner = previewTextBlocksOnly.map((b) => (
    <p
      key={b.id}
      className={cn(
        "whitespace-pre-wrap text-xs leading-relaxed text-slate-600",
        b.align === "center" && "text-center",
        b.align === "right" && "text-right",
      )}
    >
      {b.text}
    </p>
  ));

  const previewSplitBlockMediaEl =
    previewSingleBlockMedia?.type === "video" ? (
      <video
        key={previewSingleBlockMedia.url}
        className="absolute inset-0 block h-full w-full object-contain object-center"
        src={previewSingleBlockMedia.url}
        muted
        playsInline
        loop
        autoPlay
        preload="metadata"
      />
    ) : previewSingleBlockMedia?.type === "image" ? (
      <img
        key={previewSingleBlockMedia.url}
        className="absolute inset-0 h-full w-full object-cover object-center"
        src={previewSingleBlockMedia.url}
        alt="Promo media"
      />
    ) : null;

  const previewSideMediaMaxH = Math.max(80, Math.round(previewMediaPx * 1.35));
  const previewSideMediaStyle = {
    position: "relative" as const,
    width: SPLIT_MEDIA_W_PX[previewNudgeSizeTier],
    aspectRatio: previewSideMediaAspectRatio(previewMediaHeightEff),
    maxHeight: previewSideMediaMaxH,
    backgroundColor: nudgeBackgroundColor,
  };

  const previewTitleEl = previewTitleEff ? (
    <div className="text-sm font-semibold leading-snug text-slate-900">{previewTitleEff}</div>
  ) : null;

  const previewBodyEl = previewBodyEff ? (
    <p className="text-xs leading-relaxed text-slate-600">{previewBodyEff}</p>
  ) : null;

  const previewIdentityCol = (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1 pt-0.5 sm:w-[3.25rem]">
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
    </div>
  );

  const previewCtasBlock = (
    <div className="space-y-2">
      {previewCtasEff.map((cta, index) => {
        const primary = isPrimaryButton(previewEmphasisEff, index, previewCtasEff.length);
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
  );

  let previewNudgeMain: ReactNode;
  if (previewBlocksSideBySide && previewPlacementResolved === "left") {
    previewNudgeMain = (
      <>
        <div className="flex gap-3 items-start">
          {previewIdentityCol}
          <div className="flex min-w-0 flex-1 gap-2.5">
            <div
              className="shrink-0 overflow-hidden rounded-lg border border-slate-200/90"
              style={previewSideMediaStyle}
            >
              {previewSplitBlockMediaEl}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              {previewTitleEl}
              {previewTextBlocksInner.length > 0 ? (
                <div className="space-y-2">{previewTextBlocksInner}</div>
              ) : null}
            </div>
          </div>
        </div>
        {previewCtasBlock}
      </>
    );
  } else if (previewBlocksSideBySide && previewPlacementResolved === "right") {
    previewNudgeMain = (
      <>
        <div className="flex gap-3 items-start">
          {previewIdentityCol}
          <div className="flex min-w-0 flex-1 gap-2.5">
            <div className="min-w-0 flex-1 space-y-2">
              {previewTitleEl}
              {previewTextBlocksInner.length > 0 ? (
                <div className="space-y-2">{previewTextBlocksInner}</div>
              ) : null}
            </div>
            <div
              className="shrink-0 overflow-hidden rounded-lg border border-slate-200/90"
              style={previewSideMediaStyle}
            >
              {previewSplitBlockMediaEl}
            </div>
          </div>
        </div>
        {previewCtasBlock}
      </>
    );
  } else if (previewHasBlocks) {
    previewNudgeMain = (
      <>
        <div className="flex gap-3 items-start">
          {previewIdentityCol}
          <div className="min-w-0 flex-1 space-y-2">
            {previewTitleEl}
            {previewMediaPlacementEff === "framed" ? (
              <div className="space-y-2 rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                {previewBlocksInner}
              </div>
            ) : (
              <div className="space-y-2">{previewBlocksInner}</div>
            )}
          </div>
        </div>
        {previewCtasBlock}
      </>
    );
  } else if (previewPlacementResolved === "top" && previewHasLegacyMedia) {
    previewNudgeMain = (
      <>
        <div
          className="-mx-4 -mt-4 mb-2 overflow-hidden rounded-t-2xl border-b border-slate-200/90"
          style={{ backgroundColor: nudgeBackgroundColor }}
        >
          <div className="w-full overflow-hidden">{previewLegacyMediaStackEl}</div>
        </div>
        <div className="flex gap-3 items-start">
          {previewIdentityCol}
          <div className="min-w-0 flex-1 space-y-2">
            {previewTitleEl}
            {previewBodyEl}
          </div>
        </div>
        {previewCtasBlock}
      </>
    );
  } else if (previewPlacementResolved === "left" && previewHasLegacyMedia) {
    previewNudgeMain = (
      <>
        <div className="flex gap-3 items-start">
          {previewIdentityCol}
          <div className="flex min-w-0 flex-1 gap-2.5">
            <div
              className="shrink-0 overflow-hidden rounded-lg border border-slate-200/90"
              style={previewSideMediaStyle}
            >
              {previewLegacyMediaSideEl}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              {previewTitleEl}
              {previewBodyEl}
            </div>
          </div>
        </div>
        {previewCtasBlock}
      </>
    );
  } else if (previewPlacementResolved === "right" && previewHasLegacyMedia) {
    previewNudgeMain = (
      <>
        <div className="flex gap-3 items-start">
          {previewIdentityCol}
          <div className="flex min-w-0 flex-1 gap-2.5">
            <div className="min-w-0 flex-1 space-y-2">
              {previewTitleEl}
              {previewBodyEl}
            </div>
            <div
              className="shrink-0 overflow-hidden rounded-lg border border-slate-200/90"
              style={previewSideMediaStyle}
            >
              {previewLegacyMediaSideEl}
            </div>
          </div>
        </div>
        {previewCtasBlock}
      </>
    );
  } else if (previewPlacementResolved === "framed") {
    previewNudgeMain = (
      <>
        <div className="flex gap-3 items-start">
          {previewIdentityCol}
          <div className="min-w-0 flex-1 space-y-2">
            {previewTitleEl}
            {previewBodyEl || previewHasLegacyMedia ? (
              <div className="space-y-2 rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                {previewBodyEl}
                {previewHasLegacyMedia ? (
                  <div className="mt-2 overflow-hidden rounded-lg border border-slate-200/80">
                    {previewLegacyMediaStackEl}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {previewCtasBlock}
      </>
    );
  } else {
    previewNudgeMain = (
      <>
        <div className="flex gap-3 items-start">
          {previewIdentityCol}
          <div className="min-w-0 flex-1 space-y-2">
            {previewTitleEl}
            {previewBodyEl}
            {previewHasLegacyMedia ? (
              <div className="overflow-hidden rounded-lg border border-slate-200/90">
                {previewLegacyMediaStackEl}
              </div>
            ) : null}
          </div>
        </div>
        {previewCtasBlock}
      </>
    );
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

          <DialogContent
            className="
              w-full
              max-w-[98vw]
              sm:max-w-[min(98vw,1680px)]
              max-h-[92vh]
              overflow-hidden
              rounded-xl
              p-0
            "
          >
            <DialogHeader className="px-6 pb-2 pt-4">
              <DialogTitle className="text-base font-semibold">
                {form.watch("id") ? "Edit promo" : "Create a promo"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Configure targeting, sequence, media, and buttons for this promo. Changes apply to the embedded
                widget on matching pages.
              </DialogDescription>
            </DialogHeader>

            <div
              className="
                grid
                h-[min(78vh,920px)]
                min-h-[min(70vh,640px)]
                grid-cols-1
                gap-6
                overflow-hidden
                px-6
                pb-6
                pt-0
                md:grid-cols-[minmax(280px,1.05fr)_minmax(560px,1.35fr)]
                lg:grid-cols-[minmax(300px,1fr)_minmax(620px,1.45fr)]
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
                        Modern popups flow: first nudge appears, closes, then next appears after your delay.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs font-medium">Enable sequence</Label>
                          <Switch
                            checked={sequenceEnabledWatch}
                            onCheckedChange={(v) => form.setValue("sequenceEnabled", v)}
                          />
                        </div>
                        {sequenceUiEnabled ? (
                          <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                            <Switch
                              id="sequence-random-order-header"
                              checked={form.watch("sequenceRandomOrder") ?? false}
                              onCheckedChange={(v) => form.setValue("sequenceRandomOrder", !!v)}
                            />
                            <Label
                              htmlFor="sequence-random-order-header"
                              className="cursor-pointer text-xs font-semibold text-slate-800"
                            >
                              Random order
                            </Label>
                          </div>
                        ) : null}
                      </div>
                      <p className="max-w-md text-[11px] text-muted-foreground">
                        When on, configure nudges in the storyboard and under &quot;Step media&quot; (title, layout, buttons,
                        media per step). Random order shuffles the first nudge on each load.
                      </p>
                    </div>

                    {sequenceUiEnabled ? (
                      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-violet-200/80 bg-violet-50/40 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs font-medium">Loop sequence</Label>
                          <Switch
                            checked={form.watch("sequenceLoop") ?? false}
                            onCheckedChange={(v) => form.setValue("sequenceLoop", v)}
                          />
                        </div>
                        <p className="max-w-xl text-[11px] leading-snug text-muted-foreground">
                          After the last nudge, restart from nudge 1 until the visitor dismisses the promo.
                        </p>
                      </div>
                    ) : null}

                    <div className="rounded-lg bg-background px-3 py-2 text-xs">
                      <div className="mb-2 font-medium text-slate-700">Quick timing presets</div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            form.setValue("showDelayAfterNavMs", 2500);
                            form.setValue("autoCloseMs", 4500);
                            form.setValue("betweenPopupsMs", 10000);
                            form.setValue("maxSequenceItems", 3);
                            form.setValue("animationPreset", "soft_slide");
                          }}
                        >
                          Balanced
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            form.setValue("showDelayAfterNavMs", 1800);
                            form.setValue("autoCloseMs", 3200);
                            form.setValue("betweenPopupsMs", 7000);
                            form.setValue("maxSequenceItems", 3);
                            form.setValue("animationPreset", "ppt_pop");
                          }}
                        >
                          Aggressive
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            form.setValue("showDelayAfterNavMs", 3200);
                            form.setValue("autoCloseMs", 5200);
                            form.setValue("betweenPopupsMs", 12000);
                            form.setValue("maxSequenceItems", 2);
                            form.setValue("animationPreset", "cinematic");
                          }}
                        >
                          Soft
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // Lightweight "AI-like" auto tuning from theme style.
                            const dark = (theme?.secondaryTextColor || "").toLowerCase() === "#ffffff";
                            if (dark) {
                              form.setValue("showDelayAfterNavMs", 3000);
                              form.setValue("autoCloseMs", 5200);
                              form.setValue("betweenPopupsMs", 11000);
                              form.setValue("maxSequenceItems", 2);
                              form.setValue("animationPreset", "cinematic");
                            } else {
                              form.setValue("showDelayAfterNavMs", 2200);
                              form.setValue("autoCloseMs", 4200);
                              form.setValue("betweenPopupsMs", 9000);
                              form.setValue("maxSequenceItems", 3);
                              form.setValue("animationPreset", "soft_slide");
                            }
                            toast.success("Smart tuning applied");
                          }}
                        >
                          Smart tune
                        </Button>
                      </div>
                    </div>

                    {sequenceUiEnabled ? (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                          <Label>First popup delay (seconds)</Label>
                          <Input
                            type="number"
                            min={0}
                            step={0.1}
                            value={Number((showDelayWatch / 1000).toFixed(1))}
                            onChange={(e) => {
                              const s = Number(e.target.value || 0);
                              form.setValue("showDelayAfterNavMs", Math.max(0, Math.round(s * 1000)));
                            }}
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Current: <span className="font-medium">{formatDuration(showDelayWatch)}</span>
                          </p>
                        </div>

                        <div>
                          <Label>Auto-close after (seconds)</Label>
                          <Input
                            type="number"
                            min={0}
                            step={0.1}
                            value={Number((autoCloseWatch / 1000).toFixed(1))}
                            onChange={(e) => {
                              const s = Number(e.target.value || 0);
                              form.setValue("autoCloseMs", Math.max(0, Math.round(s * 1000)));
                            }}
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Current: <span className="font-medium">{formatDuration(autoCloseWatch)}</span>
                          </p>
                        </div>

                        <div>
                          <Label>Delay before next popup (seconds)</Label>
                          <Input
                            type="number"
                            min={0}
                            step={0.1}
                            value={Number((betweenWatch / 1000).toFixed(1))}
                            onChange={(e) => {
                              const s = Number(e.target.value || 0);
                              form.setValue("betweenPopupsMs", Math.max(0, Math.round(s * 1000)));
                            }}
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Example: <code>10</code> = next nudge appears 10 seconds later.
                          </p>
                        </div>

                        <div>
                          <Label>Animation style</Label>
                          <Select
                            value={animationPresetWatch}
                            onValueChange={(v) =>
                              form.setValue(
                                "animationPreset",
                                v as "soft_slide" | "ppt_pop" | "cinematic" | "none",
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Soft slide" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="soft_slide">Soft slide</SelectItem>
                              <SelectItem value="ppt_pop">PPT pop</SelectItem>
                              <SelectItem value="cinematic">Cinematic</SelectItem>
                              <SelectItem value="none">No animation</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : null}

                    <PromoSequenceStoryboard
                      sequenceEnabled={sequenceUiEnabled}
                      sequenceSteps={sequenceStepsWatch}
                      stepRowIds={sequenceStepFields.map((f) => f.id)}
                      showDelayMs={showDelayWatch}
                      autoCloseMs={autoCloseWatch}
                      betweenMs={betweenWatch}
                      animationPreset={animationPresetWatch}
                      baseVideoUrl={perNudgeLayout ? "" : previewVideoUrl}
                      baseImageUrl={perNudgeLayout ? "" : previewImageUrl}
                      baseTitle={perNudgeLayout ? "" : previewTitle}
                      selectedPreviewIndex={clampedStoryIdx}
                      onSelectNudgeIndex={setStoryPreviewIndex}
                      sequenceRandomOrder={form.watch("sequenceRandomOrder") ?? false}
                      onSequenceRandomOrderChange={(v) =>
                        form.setValue("sequenceRandomOrder", v, { shouldDirty: true })
                      }
                      onReorderSteps={
                        sequenceStepFields.length > 1
                          ? (from, to) => {
                              moveSequenceStep(from, to);
                              setStoryPreviewIndex((prev) =>
                                adjustSelectedIndexAfterMove(prev, from, to),
                              );
                            }
                          : undefined
                      }
                      onAppendStep={() => {
                        appendSequenceStep({
                          ctas: DEFAULT_NUDGE_CTAS.map((c) => ({ ...c })),
                          ctaEmphasisMode: "first_primary",
                          nudgeSize: "md",
                          mediaHeight: "standard",
                          mediaPlacement: "bottom",
                          contentBlocks: [],
                        });
                        const next = Math.min(10, sequenceCountWatch + 1);
                        form.setValue("maxSequenceItems", next);
                        toast.success("Step added — edit message, CTAs, and media for this nudge");
                      }}
                    />

                    {sequenceUiEnabled ? (
                      <div className="space-y-3 rounded-xl border border-violet-200/60 bg-gradient-to-br from-violet-50/40 to-white p-4">
                        <div>
                          <Label className="text-xs font-semibold uppercase tracking-wide text-violet-900/90">
                            Step media (per nudge)
                          </Label>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Each row is one nudge: title, body, buttons, then media. Fill the text fields you want
                            visitors to see for that step.
                          </p>
                        </div>

                        {sequenceStepFields.length === 0 ? (
                          <p className="rounded-lg border border-dashed bg-white/80 px-3 py-4 text-center text-sm text-muted-foreground">
                            No extra steps yet. Click <span className="font-medium text-foreground">+</span> in the
                            storyboard or &quot;Add step&quot; to create nudges with their own uploads.
                          </p>
                        ) : null}

                        <div className="space-y-3">
                          {sequenceStepFields.map((field, index) => (
                            <div
                              key={field.id}
                              tabIndex={-1}
                              onFocusCapture={() => setStoryPreviewIndex(index)}
                              className={cn(
                                "space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-200",
                                clampedStoryIdx === index &&
                                  "ring-2 ring-violet-500/35 ring-offset-2 border-violet-200",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  className="text-left text-xs font-bold uppercase tracking-wide text-slate-700 hover:text-violet-700"
                                  onClick={() => setStoryPreviewIndex(index)}
                                >
                                  Nudge {index + 1}
                                </button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeSequenceStep(index);
                                  }}
                                >
                                  Remove step
                                </Button>
                              </div>

                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <Label className="text-xs">Title</Label>
                                  <Input
                                    className="h-9 text-sm"
                                    {...form.register(`sequenceSteps.${index}.title` as const)}
                                    placeholder="Headline for this nudge"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Body</Label>
                                  <Textarea
                                    rows={2}
                                    className="min-h-[72px] text-sm"
                                    {...form.register(`sequenceSteps.${index}.body` as const)}
                                    placeholder="Supporting text (optional)"
                                  />
                                </div>
                              </div>

                              <div className="rounded-xl border-2 border-violet-200/70 bg-violet-50/30 p-3">
                                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-violet-900">
                                  Layout
                                </p>
                                <p className="mb-3 text-[11px] text-muted-foreground">
                                  Card <span className="font-medium">width</span> and media{" "}
                                  <span className="font-medium">height</span> are independent.{" "}
                                  <span className="font-medium">Media layout</span> matches the live preview (and the
                                  embed). One image/video in structured content can sit left/right like step media.
                                  <span className="font-medium"> Nudge card background</span> is set under{" "}
                                  <span className="font-medium">Widget → Branding &amp; Chat</span> (Nudge background)
                                  for all promos today.
                                </p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <Label className="text-xs">Card width</Label>
                                    <p className="mb-1.5 text-[11px] text-muted-foreground">
                                      How wide the nudge is on the visitor&apos;s site. Overall height still grows with
                                      text; use Media height for the image/video strip.
                                    </p>
                                    <Select
                                      value={form.watch(`sequenceSteps.${index}.nudgeSize`) ?? "md"}
                                      onValueChange={(v) =>
                                        form.setValue(
                                          `sequenceSteps.${index}.nudgeSize`,
                                          v as NonNullable<PromoForm["nudgeSize"]>,
                                          { shouldDirty: true },
                                        )
                                      }
                                    >
                                      <SelectTrigger className="h-9 text-sm">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {NUDGE_SIZE_OPTIONS.map((o) => (
                                          <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label className="text-xs">Media height</Label>
                                    <p className="mb-1.5 text-[11px] text-muted-foreground">
                                      Height of the media area only (scales with card width tier).
                                    </p>
                                    <Select
                                      value={form.watch(`sequenceSteps.${index}.mediaHeight`) ?? "standard"}
                                      onValueChange={(v) =>
                                        form.setValue(
                                          `sequenceSteps.${index}.mediaHeight`,
                                          v as NonNullable<PromoForm["mediaHeight"]>,
                                          { shouldDirty: true },
                                        )
                                      }
                                    >
                                      <SelectTrigger className="h-9 text-sm">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {MEDIA_HEIGHT_OPTIONS.map((o) => (
                                          <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="sm:col-span-2">
                                    <Label className="text-xs">Media layout</Label>
                                    <p className="mb-1.5 text-[11px] text-muted-foreground">
                                      Where image or video sits relative to the title and body.
                                    </p>
                                    <Select
                                      value={form.watch(`sequenceSteps.${index}.mediaPlacement`) ?? "bottom"}
                                      onValueChange={(v) =>
                                        form.setValue(
                                          `sequenceSteps.${index}.mediaPlacement`,
                                          v as NonNullable<PromoForm["mediaPlacement"]>,
                                          { shouldDirty: true },
                                        )
                                      }
                                    >
                                      <SelectTrigger className="h-9 text-sm">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {MEDIA_PLACEMENT_OPTIONS.map((o) => (
                                          <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              </div>

                              <PromoNudgeContentBlocksFields
                                watch={form.watch}
                                setValue={form.setValue}
                                name={`sequenceSteps.${index}.contentBlocks`}
                                stepImageUrl={form.watch(`sequenceSteps.${index}.imageUrl`)}
                                stepVideoUrl={form.watch(`sequenceSteps.${index}.videoUrl`)}
                              />

                              <SequenceStepCtaFields
                                stepIndex={index}
                                control={form.control}
                                register={form.register}
                                watch={form.watch}
                                setValue={form.setValue}
                                emphasisFallback={emphasisMode}
                              />

                              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                                <Label className="mb-2 block text-xs font-medium text-slate-700">Media</Label>
                                <div className="grid gap-4 md:grid-cols-2">
                                  <MediaUploadOnly
                                    label="Image (optional)"
                                    hint="Max 8MB. Used if no video for this step."
                                    value={(form.watch(`sequenceSteps.${index}.imageUrl` as const) || "").trim()}
                                    uploading={uploadingStepKey === `${index}-image`}
                                    accept="image/*"
                                    inputId={`seq-step-${index}-img`}
                                    onPick={(file, el) =>
                                      handleSequenceStepMediaUpload(file, index, "image", el)
                                    }
                                    onClear={() =>
                                      form.setValue(`sequenceSteps.${index}.imageUrl` as const, "", {
                                        shouldDirty: true,
                                      })
                                    }
                                  />
                                  <MediaUploadOnly
                                    label="Video (optional)"
                                    hint="MP4 / WebM, max 50MB. Overrides image when set."
                                    value={(form.watch(`sequenceSteps.${index}.videoUrl` as const) || "").trim()}
                                    uploading={uploadingStepKey === `${index}-video`}
                                    accept="video/mp4,video/webm,video/quicktime,video/*"
                                    inputId={`seq-step-${index}-vid`}
                                    onPick={(file, el) =>
                                      handleSequenceStepMediaUpload(file, index, "video", el)
                                    }
                                    onClear={() =>
                                      form.setValue(`sequenceSteps.${index}.videoUrl` as const, "", {
                                        shouldDirty: true,
                                      })
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full border-dashed"
                          disabled={sequenceStepFields.length >= 10}
                          onClick={() => {
                            appendSequenceStep({
                              ctas: DEFAULT_NUDGE_CTAS.map((c) => ({ ...c })),
                              ctaEmphasisMode: "first_primary",
                              nudgeSize: "md",
                              mediaHeight: "standard",
                              mediaPlacement: "bottom",
                              contentBlocks: [],
                            });
                            form.setValue(
                              "maxSequenceItems",
                              Math.min(10, sequenceCountWatch + 1),
                            );
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" aria-hidden />
                          Add step
                        </Button>
                      </div>
                    ) : null}
                  </section>

                  <section className="space-y-4 rounded-2xl border bg-muted/40 p-4">
                    {!sequenceUiEnabled ? (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Message and buttons
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Title, body, optional media, and CTAs for a <span className="font-medium">single</span>{" "}
                            nudge (Sequence is off).
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
                          <div className="grid gap-4 md:grid-cols-2">
                            <MediaUploadOnly
                              label="Image (optional)"
                              hint="Max 8MB. Shown when no video is set."
                              value={previewImageUrl}
                              uploading={uploadingImage}
                              accept="image/*"
                              inputId="promo-base-image"
                              fileInputRef={imageFileInputRef}
                              onPick={(file, el) =>
                                handlePromoMediaUpload(
                                  file,
                                  "image",
                                  setUploadingImage,
                                  (url) => form.setValue("imageUrl", url, { shouldDirty: true }),
                                  imageFileInputRef,
                                )
                              }
                              onClear={() => form.setValue("imageUrl", "", { shouldDirty: true })}
                            />
                            <MediaUploadOnly
                              label="Video (optional)"
                              hint="MP4 / WebM, max 50MB."
                              value={previewVideoUrl}
                              uploading={uploadingVideo}
                              accept="video/mp4,video/webm,video/quicktime,video/*"
                              inputId="promo-base-video"
                              fileInputRef={videoFileInputRef}
                              onPick={(file, el) =>
                                handlePromoMediaUpload(
                                  file,
                                  "video",
                                  setUploadingVideo,
                                  (url) => form.setValue("videoUrl", url, { shouldDirty: true }),
                                  videoFileInputRef,
                                )
                              }
                              onClear={() => form.setValue("videoUrl", "", { shouldDirty: true })}
                            />
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label className="text-xs">Card width</Label>
                            <p className="mb-1.5 text-[11px] text-muted-foreground">
                              How wide the nudge is on the visitor&apos;s site. Height still follows text length; use
                              Media height for the media strip.
                            </p>
                            <Select
                              value={form.watch("nudgeSize") ?? "md"}
                              onValueChange={(v) =>
                                form.setValue("nudgeSize", v as NonNullable<PromoForm["nudgeSize"]>, {
                                  shouldDirty: true,
                                })
                              }
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {NUDGE_SIZE_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Media height</Label>
                            <p className="mb-1.5 text-[11px] text-muted-foreground">
                              Height of the photo/video area only.
                            </p>
                            <Select
                              value={form.watch("mediaHeight") ?? "standard"}
                              onValueChange={(v) =>
                                form.setValue(
                                  "mediaHeight",
                                  v as NonNullable<PromoForm["mediaHeight"]>,
                                  { shouldDirty: true },
                                )
                              }
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MEDIA_HEIGHT_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="sm:col-span-2">
                            <Label className="text-xs">Media layout</Label>
                            <p className="mb-1.5 text-[11px] text-muted-foreground">
                              Where image or video sits; &quot;Content panel&quot; = body + media in a light box under
                              the title. One image/video in structured content can use left/right. Nudge background:
                              Branding &amp; Chat → Nudge background.
                            </p>
                            <Select
                              value={form.watch("mediaPlacement") ?? "bottom"}
                              onValueChange={(v) =>
                                form.setValue(
                                  "mediaPlacement",
                                  v as NonNullable<PromoForm["mediaPlacement"]>,
                                  { shouldDirty: true },
                                )
                              }
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MEDIA_PLACEMENT_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <PromoNudgeContentBlocksFields
                          watch={form.watch}
                          setValue={form.setValue}
                          name="contentBlocks"
                          stepImageUrl={form.watch("imageUrl")}
                          stepVideoUrl={form.watch("videoUrl")}
                        />

                        {/* CTA emphasis */}
                        <div className="rounded-xl bg-background px-3 py-2 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-700">CTA emphasis</p>
                              <p className="text-[11px] text-muted-foreground">
                                Which button uses the primary (filled) style.
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
                                Buttons shown in the promo (vertical stack).
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
                                className="space-y-2 rounded-xl border bg-background p-3 text-sm shadow-[0_1px_0_rgba(15,23,42,0.03)]"
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
                      </>
                    ) : null}

                    <div
                      className={cn(
                        "flex justify-end pt-3",
                        !sequenceUiEnabled && "border-t",
                      )}
                    >
                      <Button type="submit">{form.watch("id") ? "Update promo" : "Save promo"}</Button>
                    </div>
                  </section>
                </form>
              </div>

              {/* Right column: preview */}
              <div className="hidden min-w-[min(100%,560px)] pl-2 md:flex md:flex-col lg:min-w-[600px]">
                <div className="mb-2 space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Live preview
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {sequenceUiEnabled && sequenceStepsWatch.length > 0
                      ? `Nudge ${clampedStoryIdx + 1} of ${sequenceStepsWatch.length} — updates when you work in a step below or tap the dots.`
                      : sequenceUiEnabled
                        ? "Add steps under “Step media” — each step has its own message and buttons."
                        : "What visitors see on your site (colors from Branding)."}
                  </p>
                </div>
                <div className="flex flex-1 items-center justify-center overflow-x-auto rounded-xl border bg-slate-50 px-3 py-6">
                  <div
                    className={cn(
                      "w-full space-y-3 rounded-2xl border p-4 shadow-lg shadow-slate-200 transition-[max-width]",
                      NUDGE_PREVIEW_MAX_CLASS[previewNudgeSizeTier],
                    )}
                    style={{ backgroundColor: nudgeBackgroundColor }}
                  >
                    {previewNudgeMain}

                    <p className="text-[10px] text-slate-400">
                      Preview matches the embed: full-width media scales to fit (entire image/video) with a height
                      cap from Media height; side column unchanged (image cover, video contain).
                    </p>

                    {sequenceUiEnabled && sequenceStepsWatch.length > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-slate-200/80 bg-white/60 px-4 py-2.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          Nudges
                        </span>
                        <div className="flex items-center gap-1">
                          {sequenceStepsWatch.map((_, i) => (
                            <button
                              key={i}
                              type="button"
                              title={`Preview nudge ${i + 1}`}
                              onClick={() => setStoryPreviewIndex(i)}
                              className={`h-2.5 w-2.5 rounded-full transition ${i === clampedStoryIdx ? "scale-125 bg-violet-500 shadow-sm shadow-violet-300" : "bg-slate-200 hover:bg-slate-300"}`}
                            />
                          ))}
                        </div>
                      </div>
                    ) : sequenceUiEnabled && sequenceCountWatch > 1 ? (
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-slate-200/80 bg-white/60 px-4 py-2.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          Sequence
                        </span>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(sequenceCountWatch, 10) }).map((_, i) => (
                            <div
                              key={i}
                              className={`h-2 w-2 rounded-full ${i === 0 ? "bg-violet-500 shadow-sm shadow-violet-300" : "bg-slate-200"}`}
                              title={`Step ${i + 1} of ${sequenceCountWatch}`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-500">
                          Up to {sequenceCountWatch} promos in queue on this page
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-4">
        <Separator />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            One promo = one URL rule. Duplicate to reuse the same content on another path.
          </p>
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={promoListSearch}
              onChange={(e) => setPromoListSearch(e.target.value)}
              placeholder="Search name or path…"
              className="h-9 pl-8"
              aria-label="Filter promos"
            />
          </div>
        </div>

        {!list?.length && <p className="text-sm text-muted-foreground">No promos yet.</p>}

        {!!list?.length && !filteredPromoList.length && (
          <p className="text-sm text-muted-foreground">No promos match your search.</p>
        )}

        {filteredPromoList.map((p) => (
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
                    toast.error(promoSaveErrorMessage(e));
                  }
                }}
              />
              <Button variant="outline" size="sm" onClick={() => openForEdit(p)}>
                Edit
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                title="Copy content and targeting into a new promo"
                onClick={() => duplicatePromo(p as Record<string, unknown>)}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Duplicate
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
