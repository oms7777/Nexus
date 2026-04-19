// apps/embed/embed.ts
import { EMBED_CONFIG } from "./config";
import { chatBubbleIcon, closeIcon } from "./icons";
import { initVisitorTracking, destroyVisitorTracking } from "./visitor-tracker";

const NUDGE_ENABLED = true;
// Show the nudge a bit AFTER navigation so it doesn't look spammy right away.
// This is tuned for "popup" UX.
const NUDGE_SHOW_DELAY_AFTER_NAV_MS = 2500;
const NUDGE_MIN_DELAY_MS = 220;
const NUDGE_AUTO_CLOSE_MS = 4000;
const NUDGE_BETWEEN_POPUPS_MS = 1000;
const DEFAULT_NUDGE_COUNT_PER_PAGE = 3;

/** Launcher when iframe never sends colors after 4s timeout (rare). */
const FAB_FALLBACK_COLOR = "#475569";

type ThemePayload = {
  primaryColor?: string;
  primaryTextColor?: string;
  secondaryColor?: string;
  secondaryTextColor?: string;
  nudgeBackgroundColor?: string;
  chatBubbleColor?: string;
};

type SimpleCta = {
  kind: "open_chat" | "open_booking" | "open_url";
  label: string;
  url?: string;
};

type NudgeContentBlock =
  | { type: "text"; id: string; text: string; align?: "left" | "center" | "right" }
  | { type: "image"; id: string; url: string }
  | { type: "video"; id: string; url: string };

type PromoPayload = {
  title?: string;
  body?: string;
  imageUrl?: string;
  videoUrl?: string;
  primary?: string;
  secondary?: string;
  primaryCta?: SimpleCta;
  secondaryCta?: SimpleCta;
  avatars?: string[];
  privacyUrl?: string;
  theme?: ThemePayload;
  brandLogoUrl?: string;
  identityMode?: "auto" | "logo" | "avatars";
  ctaList?: SimpleCta[];
  canUseVoice?: boolean;
  /** When false, hide host nudge mic (Integrations toggle). */
  voiceButtonEnabled?: boolean;
  /** When false, hide host nudge mic (no assistant selected). */
  voiceAssistantConfigured?: boolean;
  nudgeSize?: "sm" | "md" | "lg" | "xl";
  mediaPlacement?: "top" | "bottom" | "left" | "right" | "framed";
  mediaHeight?: "compact" | "standard" | "tall" | "hero";
  /** @deprecated Ignored; stack media uses adaptive height (full image within min/max). */
  fullFrameStackMedia?: boolean;
  /** Safe ordered blocks; when non-empty, replaces legacy body + single image/video in the nudge. */
  contentBlocks?: NudgeContentBlock[];
};

type NudgeSize = "sm" | "md" | "lg" | "xl";
type MediaPlacement = "top" | "bottom" | "left" | "right" | "framed";
type MediaHeight = "compact" | "standard" | "tall" | "hero";

type NudgeLayoutSpec = {
  width: number;
  mediaH: number;
  padY: number;
  padX: number;
  titlePx: number;
  bodyPx: number;
  splitMediaW: number;
};

function normalizeNudgeSize(v: unknown): NudgeSize {
  if (v === "sm" || v === "md" || v === "lg" || v === "xl") return v;
  return "md";
}

function normalizeMediaPlacement(v: unknown): MediaPlacement {
  if (v === "top" || v === "bottom" || v === "left" || v === "right" || v === "framed")
    return v;
  return "bottom";
}

function normalizeMediaHeight(v: unknown): MediaHeight {
  if (v === "compact" || v === "standard" || v === "tall" || v === "hero") return v;
  return "standard";
}

function resolveMediaPixelHeight(spec: NudgeLayoutSpec, h: MediaHeight): number {
  const mult =
    h === "compact" ? 0.72 : h === "standard" ? 1 : h === "tall" ? 1.38 : 1.85;
  return Math.max(56, Math.round(spec.mediaH * mult));
}

const MAX_NUDGE_CONTENT_BLOCKS = 8;
const MAX_NUDGE_BLOCK_TEXT_LEN = 1500;
const NUDGE_BLOCK_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function isSafeHttpUrlForNudge(s: string): boolean {
  try {
    const u = new URL(String(s).trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function escapeHtmlNudge(s: string) {
  return s.replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[m]!,
  );
}

function escapeAttrNudge(s: string) {
  return s.replace(/"/g, "&quot;");
}

/** First CTA index that opens an external URL (used to make promo video/image clickable). */
function findFirstOpenUrlCtaIndex(payload: PromoPayload, ctaList: SimpleCta[]): number | null {
  for (let i = 0; i < ctaList.length; i++) {
    const c = ctaList[i];
    const u = c?.url?.trim();
    if (c?.kind === "open_url" && u && isSafeHttpUrlForNudge(u)) return i;
  }
  if (ctaList.length === 0) {
    const pu = payload.primaryCta?.url?.trim();
    if (payload.primaryCta?.kind === "open_url" && pu && isSafeHttpUrlForNudge(pu)) return 0;
    const su = payload.secondaryCta?.url?.trim();
    if (payload.secondaryCta?.kind === "open_url" && su && isSafeHttpUrlForNudge(su)) return 1;
  }
  return null;
}

function wrapNudgeMediaWithCta(
  innerHtml: string,
  ctaIndex: number | null,
  borderRadiusCss = "10px",
): string {
  if (ctaIndex == null || !innerHtml.trim()) return innerHtml;
  return `<div tabindex="0" role="link" data-promo-media-cta="${ctaIndex}" title="Open link" style="cursor:pointer;display:block;line-height:0;border-radius:${borderRadiusCss};overflow:hidden;outline-offset:2px;">${innerHtml}</div>`;
}

/**
 * Full-width strip (top / bottom / hero bleed / stacked blocks): image/video scales within
 * [minHeight, maxHeight] so wide graphics are not side-cropped; short logos sit centered in min band.
 */
function promoLegacyStackMediaInnerHtml(
  safeVideo: string,
  safeImage: string,
  maxHeightPx: number,
  minHeightPx: number,
  surfaceBg: string,
  borderRadiusCss = "10px",
): string {
  const bg = escapeAttrNudge(surfaceBg);
  const wrap = [
    "width:100%;",
    `min-height:${minHeightPx}px;`,
    "display:flex;",
    "align-items:center;",
    "justify-content:center;",
    `background:${bg};`,
    `border-radius:${borderRadiusCss};`,
    "border:1px solid rgba(229,231,235,.9);",
    "line-height:0;",
    "box-sizing:border-box;",
  ].join("");
  const innerSized = `max-width:100%;max-height:${maxHeightPx}px;width:auto;height:auto;display:block;object-fit:contain;object-position:center;`;
  if (safeVideo) {
    return `<div style="${wrap}"><video src="${safeVideo}" muted autoplay loop playsinline preload="auto" style="${innerSized}"></video></div>`;
  }
  if (safeImage) {
    return `<div style="${wrap}"><img src="${safeImage}" alt="Promo media" style="${innerSized}" /></div>`;
  }
  return "";
}

/** Media left/right: aspect-ratio column + cover (no grey letterboxing bars). */
function sideMediaAspectRatio(h: MediaHeight): string {
  if (h === "compact") return "1 / 1";
  if (h === "standard") return "4 / 5";
  if (h === "tall") return "3 / 4";
  if (h === "hero") return "9 / 16";
  return "4 / 5";
}

/** Single side-column image or video (URL already attribute-safe). */
function sideMediaShellFromUrl(
  safeAttrUrl: string,
  isVideo: boolean,
  mediaHeight: MediaHeight,
  effectiveMediaH: number,
  surfaceBg: string,
): string {
  const bg = escapeAttrNudge(surfaceBg);
  const aspect = sideMediaAspectRatio(mediaHeight);
  const maxH = Math.max(80, Math.round(effectiveMediaH * 1.35));
  /** `position:absolute` fill avoids empty bands when % heights on img/video fail inside aspect-ratio boxes. */
  const wrap = [
    "position:relative;",
    "width:100%;",
    `aspect-ratio:${aspect};`,
    `max-height:${maxH}px;`,
    "border-radius:10px;",
    "overflow:hidden;",
    "border:1px solid rgba(229,231,235,.9);",
    `background:${bg};`,
    "line-height:0;",
  ].join("");
  const innerVideo =
    "position:absolute;left:0;top:0;right:0;bottom:0;width:100%;height:100%;object-fit:contain;object-position:center;display:block;";
  const innerImage =
    "position:absolute;left:0;top:0;right:0;bottom:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block;";
  if (isVideo) {
    return `<div style="${wrap}"><video src="${safeAttrUrl}" muted autoplay loop playsinline preload="auto" style="${innerVideo}"></video></div>`;
  }
  return `<div style="${wrap}"><img src="${safeAttrUrl}" alt="Promo media" style="${innerImage}" /></div>`;
}

function promoSideMediaInnerHtml(
  safeVideo: string,
  safeImage: string,
  mediaHeight: MediaHeight,
  effectiveMediaH: number,
  surfaceBg: string,
): string {
  if (safeVideo) {
    return sideMediaShellFromUrl(safeVideo, true, mediaHeight, effectiveMediaH, surfaceBg);
  }
  if (safeImage) {
    return sideMediaShellFromUrl(safeImage, false, mediaHeight, effectiveMediaH, surfaceBg);
  }
  return "";
}

function normalizeBlockTextAlign(raw: unknown): "left" | "center" | "right" | undefined {
  if (raw === "center" || raw === "right" || raw === "left") return raw;
  return undefined;
}

function normalizeContentBlocksFromPayload(raw: unknown): NudgeContentBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: NudgeContentBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    if (!NUDGE_BLOCK_ID_RE.test(id)) continue;
    const t = o.type;
    if (t === "text" && typeof o.text === "string") {
      const text = o.text.slice(0, MAX_NUDGE_BLOCK_TEXT_LEN);
      if (text.trim().length > 0) {
        const align = normalizeBlockTextAlign(o.align);
        out.push(
          align && align !== "left"
            ? { type: "text", id, text, align }
            : { type: "text", id, text },
        );
      }
    } else if (t === "image" && typeof o.url === "string") {
      const url = o.url.trim().slice(0, 2048);
      if (url && isSafeHttpUrlForNudge(url)) out.push({ type: "image", id, url });
    } else if (t === "video" && typeof o.url === "string") {
      const url = o.url.trim().slice(0, 2048);
      if (url && isSafeHttpUrlForNudge(url)) out.push({ type: "video", id, url });
    }
    if (out.length >= MAX_NUDGE_CONTENT_BLOCKS) break;
  }
  return out;
}

/**
 * Structured content (text blocks) switches the nudge to the "blocks" layout, which skipped
 * legacy imageUrl/videoUrl. Merge a synthetic media block when the editor used upload + text blocks.
 */
function mergeLegacyMediaIntoContentBlocks(
  blocks: NudgeContentBlock[],
  rawVideoUrl: string,
  rawImageUrl: string,
  placement: ReturnType<typeof normalizeMediaPlacement>,
): NudgeContentBlock[] {
  if (blocks.length === 0) return blocks;
  const hasBlockMedia = blocks.some((b) => b.type === "image" || b.type === "video");
  if (hasBlockMedia) return blocks;

  const videoOk = rawVideoUrl && isSafeHttpUrlForNudge(rawVideoUrl);
  const imageOk = rawImageUrl && isSafeHttpUrlForNudge(rawImageUrl);
  if (!videoOk && !imageOk) return blocks;

  const synthetic: NudgeContentBlock = videoOk
    ? { type: "video", id: "legacy-media", url: rawVideoUrl }
    : { type: "image", id: "legacy-media", url: rawImageUrl };

  if (blocks.length >= MAX_NUDGE_CONTENT_BLOCKS) return blocks;

  return placement === "top"
    ? [synthetic, ...blocks]
    : [...blocks, synthetic];
}

function buildContentBlocksStackHtml(
  blocks: NudgeContentBlock[],
  spec: NudgeLayoutSpec,
  stackMaxHeightPx: number,
  mediaSurfaceBg: string,
  mediaCtaIndex: number | null = null,
): string {
  const bg = escapeAttrNudge(mediaSurfaceBg);
  const minH = Math.max(48, Math.round(stackMaxHeightPx * 0.32));
  const wrap = [
    "width:100%;",
    `min-height:${minH}px;`,
    "display:flex;",
    "align-items:center;",
    "justify-content:center;",
    `background:${bg};`,
    "border-radius:10px;",
    "border:1px solid rgba(229,231,235,.9);",
    "line-height:0;",
    "box-sizing:border-box;",
  ].join("");
  const inner = `max-width:100%;max-height:${stackMaxHeightPx}px;width:auto;height:auto;display:block;object-fit:contain;object-position:center;`;
  const parts: string[] = [];
  for (const b of blocks) {
    const top = parts.length > 0 ? "10px" : "0";
    if (b.type === "text") {
      const ta =
        b.align === "center" || b.align === "right"
          ? `text-align:${b.align};`
          : b.align === "left"
            ? "text-align:left;"
            : "";
      parts.push(
        `<div style="margin-top:${top};color:#4b5563;font-size:${spec.bodyPx}px;line-height:1.4;word-break:break-word;${ta}">${escapeHtmlNudge(b.text.trim())}</div>`,
      );
    } else if (b.type === "image") {
      const u = escapeAttrNudge(b.url);
      const core = `<div style="${wrap}"><img src="${u}" alt="" style="${inner}" /></div>`;
      parts.push(
        `<div style="margin-top:${top};">${wrapNudgeMediaWithCta(core, mediaCtaIndex)}</div>`,
      );
    } else {
      const u = escapeAttrNudge(b.url);
      const core = `<div style="${wrap}"><video src="${u}" muted autoplay loop playsinline preload="auto" style="${inner}"></video></div>`;
      parts.push(
        `<div style="margin-top:${top};">${wrapNudgeMediaWithCta(core, mediaCtaIndex)}</div>`,
      );
    }
  }
  return parts.join("");
}

function nudgeLayoutSpec(size: NudgeSize): NudgeLayoutSpec {
  const presets: Record<NudgeSize, NudgeLayoutSpec> = {
    sm: {
      width: 280,
      mediaH: 88,
      padY: 8,
      padX: 10,
      titlePx: 13,
      bodyPx: 13,
      splitMediaW: 100,
    },
    md: {
      width: 320,
      mediaH: 112,
      padY: 10,
      padX: 12,
      titlePx: 14,
      bodyPx: 14,
      splitMediaW: 120,
    },
    lg: {
      width: 400,
      mediaH: 140,
      padY: 11,
      padX: 13,
      titlePx: 15,
      bodyPx: 14,
      splitMediaW: 140,
    },
    xl: {
      width: 480,
      mediaH: 200,
      padY: 12,
      padX: 14,
      titlePx: 16,
      bodyPx: 15,
      splitMediaW: 160,
    },
  };
  return presets[size];
}

function applyNudgeBoxStyles(el: HTMLDivElement, spec: NudgeLayoutSpec) {
  el.style.width = `${spec.width}px`;
  el.style.maxWidth = `min(${spec.width}px, calc(100vw - 96px))`;
  el.style.padding = `${spec.padY}px ${spec.padX}px`;
  el.style.fontSize = `${spec.bodyPx}px`;
}

type PromoSequencePayload = {
  items: PromoPayload[];
  settings?: {
    sequenceEnabled?: boolean;
    /** When true, after the last nudge the sequence restarts from nudge 1 until dismiss. */
    sequenceLoop?: boolean;
    showDelayAfterNavMs?: number;
    autoCloseMs?: number;
    betweenPopupsMs?: number;
    maxSequenceItems?: number;
    animationPreset?: "soft_slide" | "ppt_pop" | "cinematic" | "none";
    sequenceRandomOrder?: boolean;
  };
};

type SuggestionsPayload = {
  greetMessage?: string;
  suggestions: string[];
  privacyUrl?: string;
  theme?: ThemePayload;
  brandLogoUrl?: string;
  canUseVoice?: boolean;
  voiceButtonEnabled?: boolean;
  voiceAssistantConfigured?: boolean;
  /**
   * Optional override for how the host should display the nudge sequence.
   * Allows per-page / per-promo customization from the widget iframe.
   */
  nudgeDisplay?: {
    countPerPage?: number;
    showDelayAfterNavMs?: number;
    minDelayMs?: number;
    autoCloseMs?: number;
    betweenPopupsMs?: number;
  };
};

type NudgeKind = "promo" | "suggestions" | null;

(function () {
  // DOM
  let iframe: HTMLIFrameElement | null = null;
  let container: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let nudge: HTMLDivElement | null = null;
  let caret: HTMLDivElement | null = null;

  // State
  let isOpen = false;
  let hasNudgePayload = false;
  let nudgeDismissed = false;
  let iframeLoaded = false;
  let TARGET_ORIGIN = "";

  // ✅ NEW: avoid "starter -> enterprise" flicker
  let nudgeKind: NudgeKind = null; // once promo is chosen, ignore suggestions
  let pendingSuggestions: SuggestionsPayload | null = null;
  let suggestionsTimer: number | null = null;
  let pendingPromoPayload: PromoPayload | null = null;
  let promoRenderTimer: number | null = null;
  let promoAutoCloseTimer: number | null = null;
  let promoNextTimer: number | null = null;
  let promoSequenceItems: PromoPayload[] = [];
  let promoSequenceSettings: PromoSequencePayload["settings"] | null = null;
  let promoIndex = 0;
  let lastNavigationTs = Date.now();
  let nudgeAutoCloseTimer: number | null = null;
  let suggestionsNextTimer: number | null = null;
  let nudgeIndex = 0;
  let suggestionsSequenceItems: string[] = [];
  let nudgeCountPerPage = DEFAULT_NUDGE_COUNT_PER_PAGE;

  function parseNudgeCountFromAttrs(scriptEl: HTMLScriptElement | null) {
    const raw = scriptEl?.getAttribute("data-nudge-count");
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return;
    const int = Math.max(1, Math.min(5, Math.floor(n)));
    nudgeCountPerPage = int;
  }

  // Pending CTA when user clicks nudge before widget is ready
  let pendingCta: {
    type: "run-cta" | "run-secondary-cta" | "open-chat";
    index?: number;
    kind?: SimpleCta["kind"];
    url?: string;
  } | null = null;
  let pendingCtaTimeout: number | null = null;

  // Tracking
  let trackingStarted = false;
  let trackingSessionId: string | null = null;

  // Config from <script>
  let organizationId: string | null = null;
  let position: "bottom-right" | "bottom-left" = EMBED_CONFIG.DEFAULT_POSITION;

  // THEME
  let theme: ThemePayload | null = null;
  let brandLogoUrl: string | null = null;
  let embedLayout: "compact" | "full_width_bottom" = "compact";

  // éviter flash FAB (violet + icône par défaut) avant que l’iframe ait envoyé le branding réel
  let fabRevealed = false;
  /** True once `nexus:theme` or `nexus:suggestions` ran — never from promo alone (promo can post before ws theme exists). */
  let fabEmbedBrandingKnown = false;
  /** True after iframe load fallback timeout so the FAB never stays invisible forever. */
  let fabRevealForced = false;
  let fabFallbackRevealTimer: number | null = null;
  /** Invalidates in-flight logo preload when applyThemeToFab runs again. */
  let fabFaceGeneration = 0;

  // patchHistory cleanup
  let unpatchHistory: (() => void) | null = null;

  /** Resync parent URL → iframe even when the host router bypasses patched history (fallback). */
  let parentLocationPollTimer: number | null = null;
  let onVisibilityParentSync: (() => void) | null = null;
  let onWindowFocusParentSync: (() => void) | null = null;

  const currentScript = document.currentScript as HTMLScriptElement | null;

  if (currentScript) {
    organizationId = currentScript.getAttribute("data-organization-id");
    position =
      (currentScript.getAttribute(
        "data-position",
      ) as "bottom-right" | "bottom-left") ?? EMBED_CONFIG.DEFAULT_POSITION;
    parseNudgeCountFromAttrs(currentScript);
  } else {
    const scripts = document.querySelectorAll('script[src*="widget"]');
    const embedScript = Array.from(scripts).find((s) =>
      s.hasAttribute("data-organization-id"),
    ) as HTMLScriptElement | undefined;

    if (embedScript) {
      organizationId = embedScript.getAttribute("data-organization-id");
      position =
        (embedScript.getAttribute(
          "data-position",
        ) as "bottom-right" | "bottom-left") ?? EMBED_CONFIG.DEFAULT_POSITION;
      parseNudgeCountFromAttrs(embedScript);
    }
  }

  if (!organizationId) {
    console.error("Nexus Widget: data-organization-id attribute is required");
    return;
  }

  function init() {
    // Patch history as early as possible so SPA navigations before the iframe loads still
    // update lastNavigationTs + nudges; sendParentLocation() no-ops until iframe is ready.
    if (!unpatchHistory) {
      unpatchHistory = patchHistoryForSpa(() => {
        lastNavigationTs = Date.now();
        sendParentLocation();
        if (
          pendingSuggestions &&
          nudgeKind !== "promo" &&
          !isOpen &&
          !nudgeDismissed
        ) {
          scheduleSuggestions(pendingSuggestions);
        }
        if (nudgeKind === "promo" && promoSequenceItems.length > 0 && !isOpen) {
          schedulePromoSequence({
            items: promoSequenceItems,
            settings: promoSequenceSettings ?? undefined,
          });
        }
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
  }

  // patchHistory to detect SPA navigation
  function patchHistoryForSpa(onChange: () => void) {
    const origPush = history.pushState;
    const origReplace = history.replaceState;

    const fire = () => Promise.resolve().then(onChange);

    history.pushState = function (this: History, ...args: any[]) {
      const ret = origPush.apply(this, args as any);
      fire();
      return ret;
    } as any;

    history.replaceState = function (this: History, ...args: any[]) {
      const ret = origReplace.apply(this, args as any);
      fire();
      return ret;
    } as any;

    window.addEventListener("popstate", fire);
    window.addEventListener("hashchange", fire);

    return () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener("popstate", fire);
      window.removeEventListener("hashchange", fire);
    };
  }

  function applyContainerLayout() {
    if (!container) return;
    const isFull = embedLayout === "full_width_bottom";
    container.style.cssText = `
      position: fixed;
      ${isFull
        ? `left: 50%; transform: translate(-50%, 16px);
           width: min(1200px, calc(100vw - 96px)); max-width: 1200px;
           bottom: 80px; height: min(500px, 48vh); max-height: calc(100vh - 100px);
           border-radius: 16px; box-shadow: 0 -2px 16px rgba(0,0,0,.08);`
        : `${position === "bottom-right" ? "right: 16px;" : "left: 16px;"} bottom: 88px;
           width: 380px; height: 560px; max-width: calc(100vw - 32px); max-height: calc(100vh - 100px);
           border-radius: 14px; box-shadow: 0 2px 16px rgba(0,0,0,.08);
           transform: translateY(8px);`}
      z-index: 2147482999; overflow: hidden;
      display: none; opacity: 0;
      transition: all .28s ease; background: #fff;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
    `;
  }

  function render() {
    // FAB
    button = document.createElement("button");
    button.id = "nexus-widget-button";
    button.innerHTML = "";

    button.style.cssText = `
      all: unset;
      position: fixed;
      ${position === "bottom-right" ? "right: 16px;" : "left: 16px;"}
      bottom: 16px;
      width: 52px; height: 52px; border-radius: 9999px;
      background: transparent;
      color: #ffffff;
      cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: none;
      transition: transform .2s ease, box-shadow .2s ease, background .2s ease, opacity .2s ease;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    `;

    button.addEventListener("click", () => {
      if (isOpen) {
        hide();
        return;
      }
      openChat();
    });

    button.addEventListener("mouseenter", () => {
      if (!button) return;
      button.style.transform = "scale(1.04)";
      button.style.boxShadow = "0 4px 16px rgba(0,0,0,.18)";
    });

    button.addEventListener("mouseleave", () => {
      if (!button) return;
      button.style.transform = "scale(1)";
      button.style.boxShadow = "0 2px 12px rgba(0,0,0,.12)";
    });

    document.body.appendChild(button);

    // Container
    container = document.createElement("div");
    container.id = "nexus-widget-container";
    applyContainerLayout();

    iframe = document.createElement("iframe");
    iframe.src = buildWidgetUrl();
    iframe.allow = "microphone; clipboard-read; clipboard-write";
    iframe.style.cssText = `width:100%;height:100%;border:none;`;

    iframe.onload = () => {
      iframeLoaded = true;
      TARGET_ORIGIN = new URL(iframe!.src).origin;

      postToWidget({ type: "nexus:embed-ready" });
      sendParentLocation();
      setTimeout(sendParentLocation, 300);

      // History is patched in init() (before iframe load). Extra fallbacks for hosts where
      // soft navigation does not hit pushState/replaceState the same way.
      if (parentLocationPollTimer !== null) {
        window.clearInterval(parentLocationPollTimer);
        parentLocationPollTimer = null;
      }
      parentLocationPollTimer = window.setInterval(() => {
        sendParentLocation();
      }, 4500);

      if (onVisibilityParentSync) {
        document.removeEventListener("visibilitychange", onVisibilityParentSync);
      }
      onVisibilityParentSync = () => {
        if (document.visibilityState === "visible") sendParentLocation();
      };
      document.addEventListener("visibilitychange", onVisibilityParentSync);

      if (onWindowFocusParentSync) {
        window.removeEventListener("focus", onWindowFocusParentSync);
      }
      onWindowFocusParentSync = () => {
        sendParentLocation();
      };
      window.addEventListener("focus", onWindowFocusParentSync);

      applyThemeToFab();

      // If Convex / postMessage is slow or fails, still show the FAB after a delay (defaults).
      if (fabFallbackRevealTimer !== null) {
        window.clearTimeout(fabFallbackRevealTimer);
        fabFallbackRevealTimer = null;
      }
      fabFallbackRevealTimer = window.setTimeout(() => {
        fabFallbackRevealTimer = null;
        if (fabRevealed) return;
        fabRevealForced = true;
        applyThemeToFab();
      }, 4000);
    };

    container.appendChild(iframe);
    document.body.appendChild(container);

    window.addEventListener("message", handleMessage);

    // keep resize/scroll for nudge
    window.addEventListener("resize", placeNudge);
    window.addEventListener("scroll", placeNudge, { passive: true });
  }

  function buildWidgetUrl(): string {
    const params = new URLSearchParams();
    params.append("organizationId", organizationId!);
    return `${EMBED_CONFIG.WIDGET_URL}?${params.toString()}`;
  }

  function handleMessage(event: MessageEvent) {
    const { type, payload } = event.data || {};

    if (iframeLoaded && TARGET_ORIGIN && event.origin !== TARGET_ORIGIN) return;

    switch (type) {
      case "close":
        hide();
        break;

      case "resize":
        if (payload?.height && container) {
          container.style.height = `${payload.height}px`;
        }
        break;

      case "nexus:theme": {
        fabEmbedBrandingKnown = true;
        const p = payload as {
          theme?: ThemePayload;
          brandLogoUrl?: string;
          embedLayout?: "compact" | "full_width_bottom";
        };
        theme = p?.theme || null;
        brandLogoUrl = p?.brandLogoUrl || null;
        if (p?.embedLayout) {
          embedLayout = p.embedLayout;
          applyContainerLayout();
        }
        applyThemeToFab();
        break;
      }

      case "nexus:suggestions": {
        const sp = payload as SuggestionsPayload;
        if (!NUDGE_ENABLED) return;

        // ✅ If promo already selected, ignore suggestions (prevents flicker)
        if (nudgeKind === "promo") return;

        fabEmbedBrandingKnown = true;
        theme = sp.theme || theme || null;
        brandLogoUrl = sp.brandLogoUrl || brandLogoUrl || null;
        applyThemeToFab();

        scheduleSuggestions(sp);
        break;
      }

      case "nexus:promo": {
        const promoPayload = payload as PromoPayload;

        iframe?.contentWindow?.postMessage(
          { type: "nexus:host-ack" },
          TARGET_ORIGIN || "*",
        );
        iframe?.contentWindow?.postMessage(
          { type: "nexus:hide-internal-promo" },
          TARGET_ORIGIN || "*",
        );

        if (!NUDGE_ENABLED) return;
        schedulePromoSequence({ items: [promoPayload] });
        break;
      }

      case "nexus:promo-sequence": {
        const promoSequence = payload as PromoSequencePayload;

        iframe?.contentWindow?.postMessage(
          { type: "nexus:host-ack" },
          TARGET_ORIGIN || "*",
        );
        iframe?.contentWindow?.postMessage(
          { type: "nexus:hide-internal-promo" },
          TARGET_ORIGIN || "*",
        );

        if (!NUDGE_ENABLED) return;
        schedulePromoSequence(promoSequence);
        break;
      }

      case "nexus:session-ready": {
        if (!organizationId) return;

        // Widget sends `contactSessionId` (Convex id); older builds used `sessionId`.
        const raw = payload?.sessionId ?? payload?.contactSessionId;
        const sid = typeof raw === "string" ? raw.trim() : "";
        if (!sid.length) return;

        if (trackingStarted && trackingSessionId === sid) return;

        trackingStarted = true;
        trackingSessionId = sid;

        initVisitorTracking({
          orgId: organizationId,
          sessionId: sid,
        });

        break;
      }

      case "nexus:widget-ready": {
        sendParentLocation();
        if (pendingCta) {
          if (pendingCta.type === "run-cta" && typeof pendingCta.index === "number") {
            postToWidget({
              type: "nexus:run-cta",
              index: pendingCta.index,
              kind: pendingCta.kind,
              url: pendingCta.url,
            });
          } else if (pendingCta.type === "run-secondary-cta") {
            postToWidget({ type: "nexus:run-secondary-cta" });
          } else if (pendingCta.type === "open-chat") {
            postToWidget({ type: "nexus:open-chat" });
          }
          pendingCta = null;
        }
        if (pendingCtaTimeout) {
          window.clearTimeout(pendingCtaTimeout);
          pendingCtaTimeout = null;
        }
        break;
      }

      default:
        break;
    }
  }

  function cancelSuggestionsSequence() {
    if (suggestionsTimer) {
      window.clearTimeout(suggestionsTimer);
      suggestionsTimer = null;
    }
    if (nudgeAutoCloseTimer) {
      window.clearTimeout(nudgeAutoCloseTimer);
      nudgeAutoCloseTimer = null;
    }
    if (suggestionsNextTimer) {
      window.clearTimeout(suggestionsNextTimer);
      suggestionsNextTimer = null;
    }
    suggestionsSequenceItems = [];
    nudgeIndex = 0;
  }

  function getEffectiveNudgeDisplay(sp: SuggestionsPayload) {
    const display = sp.nudgeDisplay || {};
    const count = display.countPerPage ?? nudgeCountPerPage;
    const showDelayAfterNavMs = display.showDelayAfterNavMs ?? NUDGE_SHOW_DELAY_AFTER_NAV_MS;
    const minDelayMs = display.minDelayMs ?? NUDGE_MIN_DELAY_MS;
    const autoCloseMs = display.autoCloseMs ?? NUDGE_AUTO_CLOSE_MS;
    const betweenPopupsMs = display.betweenPopupsMs ?? NUDGE_BETWEEN_POPUPS_MS;

    return {
      countPerPage: Math.max(1, Math.min(5, Math.floor(count))),
      showDelayAfterNavMs,
      minDelayMs,
      autoCloseMs,
      betweenPopupsMs,
    };
  }

  function buildSuggestionSequence(sp: SuggestionsPayload, count: number): string[] {
    const all = Array.isArray(sp.suggestions) ? sp.suggestions.filter(Boolean) : [];
    if (!all.length) return [];

    if (all.length >= count) return all.slice(0, count);

    // rotate fallback so we always show `count` nudges
    const seq: string[] = [];
    for (let i = 0; i < count; i++) {
      seq.push(all[i % all.length]!);
    }
    return seq;
  }

  function scheduleSuggestions(sp: SuggestionsPayload) {
    // Keep last suggestions, but delay render after navigation.
    // If promo arrives right after, we never show suggestions => no flash.
    cancelSuggestionsSequence();
    pendingSuggestions = sp;
    hasNudgePayload = true;

    const effectiveDisplay = getEffectiveNudgeDisplay(sp);
    const countPerPage = effectiveDisplay.countPerPage;

    const elapsed = Date.now() - lastNavigationTs;
    const remainingAfterNav = effectiveDisplay.showDelayAfterNavMs - elapsed;
    const delay = Math.max(effectiveDisplay.minDelayMs, remainingAfterNav);

    suggestionsSequenceItems = buildSuggestionSequence(sp, countPerPage);
    nudgeIndex = 0;

    suggestionsTimer = window.setTimeout(() => {
      suggestionsTimer = null;
      if (!NUDGE_ENABLED) return;
      if (nudgeDismissed) return;
      if (isOpen) return;
      if (nudgeKind === "promo") return;
      if (!pendingSuggestions || !suggestionsSequenceItems.length) return;

      nudgeKind = "suggestions";
      const showOne = (idx: number) => {
        if (!NUDGE_ENABLED) return;
        if (nudgeDismissed) return;
        if (isOpen) return;
        if (nudgeKind === "promo") return;
        if (!pendingSuggestions) return;
        if (!suggestionsSequenceItems.length) return;
        if (idx >= suggestionsSequenceItems.length) return;

        nudgeIndex = idx;
        renderSuggestionsNudge(
          pendingSuggestions,
          suggestionsSequenceItems[idx]!,
          idx + 1,
          suggestionsSequenceItems.length,
        );

        // Auto close then continue
        nudgeAutoCloseTimer = window.setTimeout(() => {
          nudgeAutoCloseTimer = null;
          // close current one (do not cancel the whole queue)
          removeNudgeOnly();

          const nextIdx = idx + 1;
          if (nextIdx >= suggestionsSequenceItems.length) {
            // End: appear then disappear on this page load.
            pendingSuggestions = null;
            hasNudgePayload = false;
            nudgeKind = null;
            return;
          }

          suggestionsNextTimer = window.setTimeout(() => {
            suggestionsNextTimer = null;
            showOne(nextIdx);
          }, effectiveDisplay.betweenPopupsMs);
        }, effectiveDisplay.autoCloseMs);
      };

      showOne(0);
    }, delay);
  }

  function cancelSuggestions() {
    pendingSuggestions = null;
    hasNudgePayload = false;
    cancelSuggestionsSequence();
  }

  function cancelPromoSequence() {
    pendingPromoPayload = null;
    promoSequenceItems = [];
    promoSequenceSettings = null;
    promoIndex = 0;

    if (promoRenderTimer) {
      window.clearTimeout(promoRenderTimer);
      promoRenderTimer = null;
    }
    if (promoAutoCloseTimer) {
      window.clearTimeout(promoAutoCloseTimer);
      promoAutoCloseTimer = null;
    }
    if (promoNextTimer) {
      window.clearTimeout(promoNextTimer);
      promoNextTimer = null;
    }
  }

  function schedulePromoSequence(promoPayload: PromoSequencePayload) {
    cancelPromoSequence();
    cancelSuggestions();

    nudgeKind = "promo";
    hasNudgePayload = true;

    const allItems = Array.isArray(promoPayload.items) ? promoPayload.items : [];
    const settings = promoPayload.settings || {};
    const sequenceEnabled = settings.sequenceEnabled !== false;
    const maxItems = Math.max(1, Math.min(10, Math.floor(settings.maxSequenceItems ?? 3)));

    promoSequenceItems = sequenceEnabled ? allItems.slice(0, maxItems) : allItems.slice(0, 1);
    promoSequenceSettings = settings;

    if (!promoSequenceItems.length) {
      hasNudgePayload = false;
      nudgeKind = null;
      return;
    }

    theme = promoSequenceItems[0]?.theme || theme || null;
    brandLogoUrl = promoSequenceItems[0]?.brandLogoUrl || brandLogoUrl || null;
    applyThemeToFab();

    const elapsed = Date.now() - lastNavigationTs;
    const showDelayAfterNavMs = settings.showDelayAfterNavMs ?? NUDGE_SHOW_DELAY_AFTER_NAV_MS;
    const remainingAfterNav = showDelayAfterNavMs - elapsed;
    const delay = Math.max(NUDGE_MIN_DELAY_MS, remainingAfterNav);

    const autoCloseMs = settings.autoCloseMs ?? NUDGE_AUTO_CLOSE_MS;
    const betweenPopupsMs = settings.betweenPopupsMs ?? 10000;

    const showOne = (idx: number) => {
      if (!NUDGE_ENABLED) return;
      if (nudgeDismissed) return;
      if (isOpen) return;
      if (nudgeKind !== "promo") return;
      if (idx >= promoSequenceItems.length) return;

      promoIndex = idx;
      const item = promoSequenceItems[idx]!;
      pendingPromoPayload = item;
      renderNudge(item);

      promoAutoCloseTimer = window.setTimeout(() => {
        promoAutoCloseTimer = null;
        animatePromoOutAndRemove();

        const next = idx + 1;
        const loop = promoSequenceSettings?.sequenceLoop === true;
        if (next >= promoSequenceItems.length) {
          if (loop && promoSequenceItems.length > 0) {
            promoNextTimer = window.setTimeout(() => {
              promoNextTimer = null;
              showOne(0);
            }, betweenPopupsMs);
            return;
          }
          cancelPromoSequence();
          nudgeKind = null;
          hasNudgePayload = false;
          return;
        }

        promoNextTimer = window.setTimeout(() => {
          promoNextTimer = null;
          showOne(next);
        }, betweenPopupsMs);
      }, autoCloseMs);
    };

    promoRenderTimer = window.setTimeout(() => {
      promoRenderTimer = null;
      showOne(0);
    }, delay);
  }

  function getPromoAnimationConfig() {
    const preset = promoSequenceSettings?.animationPreset ?? "soft_slide";
    if (preset === "none") {
      return {
        hiddenTransform: "translateY(0) scale(1)",
        shownTransform: "translateY(0) scale(1)",
        exitTransform: "translateY(0) scale(1)",
        transition: "opacity .12s linear",
      };
    }
    if (preset === "ppt_pop") {
      return {
        hiddenTransform: "translateY(14px) scale(0.94)",
        shownTransform: "translateY(0) scale(1)",
        exitTransform: "translateY(-8px) scale(0.95)",
        transition: "opacity .24s cubic-bezier(.2,.9,.2,1), transform .24s cubic-bezier(.2,.9,.2,1)",
      };
    }
    if (preset === "cinematic") {
      return {
        hiddenTransform: "translateY(18px) scale(0.985)",
        shownTransform: "translateY(0) scale(1)",
        exitTransform: "translateY(-10px) scale(0.98)",
        transition: "opacity .32s ease, transform .32s cubic-bezier(.16,1,.3,1)",
      };
    }
    // soft_slide
    return {
      hiddenTransform: "translateY(10px) scale(0.985)",
      shownTransform: "translateY(0) scale(1)",
      exitTransform: "translateY(-6px) scale(0.99)",
      transition: "opacity .18s ease, transform .18s ease",
    };
  }

  function animatePromoOutAndRemove() {
    const cfg = getPromoAnimationConfig();
    if (nudge) {
      nudge.style.transition = cfg.transition;
      nudge.style.opacity = "0";
      nudge.style.transform = cfg.exitTransform;
    }
    if (caret) caret.style.opacity = "0";
    window.setTimeout(() => {
      removeNudgeOnly();
    }, cfg.transition.includes(".32s") ? 340 : cfg.transition.includes(".24s") ? 260 : 190);
  }

  function revealFabIfNeeded() {
    if (!button) return;
    if (fabRevealed) return;

    // Do not show until the iframe has announced branding (or load fallback), even if a nudge
    // was scheduled — `hasNudgePayload` alone used to reveal the default FAB too early.
    if (!fabEmbedBrandingKnown && !fabRevealForced) return;

    if (fabFallbackRevealTimer !== null) {
      window.clearTimeout(fabFallbackRevealTimer);
      fabFallbackRevealTimer = null;
    }

    fabRevealed = true;
    button.style.visibility = "visible";
    button.style.boxShadow = "0 2px 12px rgba(0,0,0,.12)";
    button.style.opacity = "1";
    button.style.pointerEvents = "auto";
  }

  function applyThemeToFab() {
    if (!button) return;

    const brandingReady = fabEmbedBrandingKnown || fabRevealForced;

    // Until `nexus:theme` / suggestions (or 4s fallback), do not paint the launcher — even at
    // opacity:0 some environments still flash the default purple for one frame.
    if (!brandingReady && !isOpen) {
      button.style.background = "transparent";
      button.style.boxShadow = "none";
      button.style.visibility = "hidden";
      button.innerHTML = "";
      return;
    }

    const chatC = theme?.chatBubbleColor?.trim();
    const primC = theme?.primaryColor?.trim();
    let bubbleColor: string;
    if (chatC) bubbleColor = chatC;
    else if (primC) bubbleColor = primC;
    else if (fabRevealForced) bubbleColor = FAB_FALLBACK_COLOR;
    else if (brandLogoUrl?.trim()) bubbleColor = "transparent";
    else bubbleColor = "#ffffff";

    const isLightFab =
      bubbleColor === "transparent" ||
      bubbleColor === "#ffffff" ||
      bubbleColor.toLowerCase() === "#fff";
    const textColor =
      theme?.primaryTextColor?.trim() ||
      (isLightFab ? "#334155" : "#ffffff");

    button.style.background = bubbleColor;
    button.style.color = textColor;
    button.style.border =
      isLightFab && fabEmbedBrandingKnown && !fabRevealForced
        ? "1px solid rgba(15,23,42,0.1)"
        : "none";

    // When open, keep close icon (don't override innerHTML)
    if (isOpen) {
      revealFabIfNeeded();
      return;
    }

    const logoRaw = brandLogoUrl?.trim();
    const logoHtml = logoRaw
      ? `
        <div style="
          width:70%;height:70%;
          border-radius:9999px;
          overflow:hidden;
          display:flex;
          align-items:center;
          justify-content:center;
          background:rgba(255,255,255,0.9);
        ">
          <img src="${escapeAttr(logoRaw)}" alt="Chat" decoding="async" fetchpriority="high"
            style="width:100%;height:100%;object-fit:contain;" />
        </div>
      `
      : null;

    // First time we show the FAB: wait for logo bytes so we don't flash default icon / empty disc.
    if (logoHtml && logoRaw && !fabRevealed) {
      const gen = ++fabFaceGeneration;
      const url = logoRaw;
      const probe = new Image();
      probe.onload = () => {
        if (gen !== fabFaceGeneration || !button || isOpen) return;
        button.innerHTML = logoHtml;
        revealFabIfNeeded();
      };
      probe.onerror = () => {
        if (gen !== fabFaceGeneration || !button || isOpen) return;
        button.innerHTML = chatBubbleIcon;
        revealFabIfNeeded();
      };
      probe.src = url;
      return;
    }

    fabFaceGeneration++;
    if (logoHtml) {
      button.innerHTML = logoHtml;
    } else {
      button.innerHTML = chatBubbleIcon;
    }

    revealFabIfNeeded();
  }




  function postToWidget(msg: any) {
    if (!iframeLoaded || !iframe?.contentWindow) return;
    const origin = TARGET_ORIGIN || "*";
    iframe.contentWindow.postMessage(msg, origin);
  }

  function sendParentLocation() {
    postToWidget({ type: "nexus:parent-location", href: location.href });
  }

  /* ---------------- Nudge ---------------- */

  // Starter nudge = 1 suggestion per popup (sequence)
  function renderSuggestionsNudge(
    payload: SuggestionsPayload,
    suggestionText: string,
    step: number,
    total: number,
  ) {
    if (!NUDGE_ENABLED) return;

    const palette: ThemePayload = payload.theme || theme || {};
    const primaryColor = palette.primaryColor || "#a855f7";
    const nudgeBg = palette.nudgeBackgroundColor || "#ffffff";
    const totalSafe = Math.max(1, total || 1);
    const stepSafe = Math.max(1, Math.min(totalSafe, step || 1));

    if (!nudge) {
      nudge = document.createElement("div");
      nudge.id = "nexus-nudge";
      nudge.style.cssText = `
        all: unset;
        position: fixed;
        width: 320px; max-width: min(320px, calc(100vw - 96px));
        z-index: 2147483001;
        background: ${nudgeBg};
        border: 1px solid rgba(229,231,235,.95); border-radius: 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        padding: 10px 12px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
        font-size: 14px;
        line-height: 1.4;
        opacity: 0; transform: translateY(10px) scale(0.985);
        transition: opacity .18s ease, transform .18s ease;
        pointer-events: auto;
        background-clip: padding-box;
      `;
      document.body.appendChild(nudge);

      caret = document.createElement("div");
      caret.style.cssText = `
        position: fixed;
        width: 12px; height: 12px;
        background: ${nudgeBg};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `;
      document.body.appendChild(caret);
    }

    const suggestion = escapeHtml(suggestionText || "");

    nudge!.innerHTML = `
      <div style="position:relative">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
              <div style="display:flex;align-items:flex-start;gap:10px;">
                <div style="
                  width:30px;height:30px;border-radius:12px;
                  display:flex;align-items:center;justify-content:center;
                  background:${primaryColor}14;border:1px solid ${primaryColor}33;
                ">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:${primaryColor}">
                    <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div style="display:flex;flex-direction:column;">
                  <div style="font-weight:900;font-size:13px;color:#111827;line-height:1.2;">Need a quick answer?</div>
                  <div style="margin-top:2px;font-weight:700;font-size:11px;color:#6b7280;line-height:1;">Tap to open the assistant</div>
                </div>
              </div>

              <div style="font-weight:900;font-size:12px;color:#111827;background:${primaryColor}14;border:1px solid ${primaryColor}33;border-radius:10px;padding:6px 10px;white-space:nowrap;">
                ${stepSafe}/${totalSafe}
              </div>
            </div>

            <button id="nexus-sugg-main"
              style="
                all: unset;
                cursor:pointer;
                margin-top:12px;
                display:flex;align-items:center;justify-content:flex-start;
                width:100%;
                padding:12px 12px;
                border-radius:14px;
                background: linear-gradient(135deg, ${primaryColor}, ${primaryColor}B3);
                box-shadow: 0 14px 30px ${primaryColor}2A;
                color:#fff;
                font-weight:900;
                font-size:13px;
                line-height:1.2;
              "
            >
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${suggestion}</span>
            </button>

            ${
              payload.privacyUrl
                ? `<div style="margin-top:10px">
                    <a href="${escapeAttr(
                      payload.privacyUrl,
                    )}" target="_blank" rel="noopener noreferrer"
                      style="color:#6b7280;font-size:11px;text-decoration:underline">
                      View our privacy policy.
                    </a>
                  </div>`
                : ""
            }
          </div>

          <button id="nexus-close" title="Close"
            style="
              all: unset;
              border-radius:9999px;
              width:22px;height:22px;
              display:flex;align-items:center;justify-content:center;
              color:#9ca3af;cursor:pointer;font-size:18px;line-height:18px;
            ">×</button>
        </div>
      </div>
    `;

    const closeBtn = nudge!.querySelector<HTMLButtonElement>("#nexus-close");
    closeBtn?.addEventListener("click", () => {
      nudgeDismissed = true;
      cancelSuggestions();
      removeNudgeOnly();
    });

    const mainBtn = nudge!.querySelector<HTMLButtonElement>("#nexus-sugg-main");
    mainBtn?.addEventListener("click", () => openChat());
    mainBtn?.addEventListener("mouseenter", () => {
      if (!mainBtn) return;
      mainBtn.style.transform = "translateY(-1px)";
    });
    mainBtn?.addEventListener("mouseleave", () => {
      if (!mainBtn) return;
      mainBtn.style.transform = "translateY(0px)";
    });

    placeNudge();
    if (!isOpen && !nudgeDismissed) {
      requestAnimationFrame(() => {
        if (nudge) {
          nudge.style.opacity = "1";
          nudge.style.transform = "translateY(0) scale(1)";
        }
        if (caret) caret.style.opacity = "1";
      });
    }
  }

  function renderNudge(payload: PromoPayload) {
    if (!NUDGE_ENABLED) return;

    const palette: ThemePayload = payload.theme || theme || {};
    const primaryColor = palette.primaryColor || "#a855f7";
    const primaryTextColor = palette.primaryTextColor || "#ffffff";
    const secondaryColor = palette.secondaryColor || "#ffffff";
    const nudgeBg = palette.nudgeBackgroundColor || "#ffffff";
    const secondaryTextColor = palette.secondaryTextColor || "#111827";

    // mic colors = bubble (branding)
    const micBg = palette.chatBubbleColor || palette.primaryColor || "#a855f7";
    const micFg = palette.primaryTextColor || "#ffffff";
    const canUseVoice = payload.canUseVoice !== false;
    const voiceAllowedByWidget =
      (payload.voiceButtonEnabled ?? true) !== false &&
      (payload.voiceAssistantConfigured ?? true) !== false;
    const showVoiceMic = canUseVoice && voiceAllowedByWidget;
    const spec = nudgeLayoutSpec(normalizeNudgeSize(payload.nudgeSize));
    const effectiveMediaH = resolveMediaPixelHeight(spec, normalizeMediaHeight(payload.mediaHeight));
    const rawPlacementForMerge = normalizeMediaPlacement(payload.mediaPlacement);
    let contentBlocksNorm = normalizeContentBlocksFromPayload(payload.contentBlocks);

    if (!nudge) {
      nudge = document.createElement("div");
      nudge.id = "nexus-nudge";
      nudge.style.cssText = `
        all: unset;
        position: fixed;
        z-index: 2147483001;
        background: ${nudgeBg};
        border: 1px solid rgba(229,231,235,.95); border-radius: 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
        line-height: 1.4;
        opacity: 0; transform: translateY(10px) scale(0.985);
        transition: opacity .18s ease, transform .18s ease;
        pointer-events: auto;
        background-clip: padding-box;
      `;
      document.body.appendChild(nudge);

      caret = document.createElement("div");
      caret.style.cssText = `
        position: fixed;
        width: 12px; height: 12px;
        background: ${nudgeBg};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `;
      document.body.appendChild(caret);
    }

    applyNudgeBoxStyles(nudge!, spec);

    const avatars = Array.isArray(payload.avatars) ? payload.avatars.slice(0, 3) : [];

    const ctaList: SimpleCta[] =
      Array.isArray(payload.ctaList) && payload.ctaList.length ? payload.ctaList : [];

    const promoMediaUrlCtaIndex = findFirstOpenUrlCtaIndex(payload, ctaList);

    const hasMulti = ctaList.length > 0;
    const identityMode: "auto" | "logo" | "avatars" = payload.identityMode || "auto";

    let identityHtml = "";

    if (identityMode === "logo") {
      if (brandLogoUrl) {
        const safeLogo = escapeAttr(brandLogoUrl);
        identityHtml = `
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${safeLogo}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `;
      }
    } else if (identityMode === "avatars") {
      if (avatars.length) {
        identityHtml = avatars
          .map(
            (src, i) => `
          <img src="${escapeAttr(src)}" alt="avatar ${i + 1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${
                i ? `margin-left:-10px; z-index:${10 - i};` : "z-index:10;"
              }
            " />`,
          )
          .join("");
      }
    } else {
      if (brandLogoUrl) {
        const safeLogo = escapeAttr(brandLogoUrl);
        identityHtml = `
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${safeLogo}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `;
      } else if (avatars.length) {
        identityHtml = avatars
          .map(
            (src, i) => `
          <img src="${escapeAttr(src)}" alt="avatar ${i + 1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${
                i ? `margin-left:-10px; z-index:${10 - i};` : "z-index:10;"
              }
            " />`,
          )
          .join("");
      }
    }

    const title =
      typeof payload.title === "string"
        ? payload.title
        : "Discover the right solution for your business project.";
    const body =
      typeof payload.body === "string"
        ? payload.body
        : "Chat with our assistant or book a 15-min demo.";
    const rawImageUrl =
      typeof payload.imageUrl === "string" ? payload.imageUrl.trim().slice(0, 2048) : "";
    const rawVideoUrl =
      typeof payload.videoUrl === "string" ? payload.videoUrl.trim().slice(0, 2048) : "";
    const safeImage = rawImageUrl ? escapeAttr(rawImageUrl) : "";
    const safeVideo = rawVideoUrl ? escapeAttr(rawVideoUrl) : "";

    contentBlocksNorm = mergeLegacyMediaIntoContentBlocks(
      contentBlocksNorm,
      rawVideoUrl,
      rawImageUrl,
      rawPlacementForMerge,
    );

    const useContentBlocks = contentBlocksNorm.length > 0;
    const mediaBlocksInContent = contentBlocksNorm.filter(
      (b) => b.type === "video" || b.type === "image",
    );
    const hasMediaInBlocks = mediaBlocksInContent.length > 0;
    const singleContentMediaBlock =
      mediaBlocksInContent.length === 1 ? mediaBlocksInContent[0] : undefined;
    const hasMedia = !!(safeVideo || safeImage) || hasMediaInBlocks;
    const rawPlacement = rawPlacementForMerge;
    const placement: MediaPlacement =
      rawPlacement === "framed"
        ? "framed"
        : !hasMedia
          ? "bottom"
          : rawPlacement;
    const textBlocksOnly = contentBlocksNorm.filter((b) => b.type === "text");
    const blocksUseSideBySide =
      useContentBlocks &&
      (rawPlacement === "left" || rawPlacement === "right") &&
      singleContentMediaBlock != null;

    const mediaSurface = nudgeBg;
    const mediaHeightNorm = normalizeMediaHeight(payload.mediaHeight);
    const stackMinH = Math.max(48, Math.round(effectiveMediaH * 0.32));
    const mediaCoreStackRaw = promoLegacyStackMediaInnerHtml(
      safeVideo,
      safeImage,
      effectiveMediaH,
      stackMinH,
      mediaSurface,
      "10px",
    );
    const mediaCoreHeroRaw = promoLegacyStackMediaInnerHtml(
      safeVideo,
      safeImage,
      effectiveMediaH,
      stackMinH,
      mediaSurface,
      "14px 14px 12px 12px",
    );
    const mediaCoreSideRaw = promoSideMediaInnerHtml(
      safeVideo,
      safeImage,
      mediaHeightNorm,
      effectiveMediaH,
      mediaSurface,
    );
    const mediaCoreStack = wrapNudgeMediaWithCta(mediaCoreStackRaw, promoMediaUrlCtaIndex, "10px");
    const mediaCoreHero = wrapNudgeMediaWithCta(
      mediaCoreHeroRaw,
      promoMediaUrlCtaIndex,
      "14px 14px 12px 12px",
    );
    const mediaCoreSide = wrapNudgeMediaWithCta(mediaCoreSideRaw, promoMediaUrlCtaIndex, "10px");

    const titleBlock =
      title.trim().length > 0
        ? `<div style="font-weight:700;font-size:${spec.titlePx}px;color:#111827;line-height:1.2;">
              ${escapeHtml(title)}
            </div>`
        : "";
    const bodyBlock =
      body.trim().length > 0
        ? `<div style="margin-top:6px;color:#4b5563;font-size:${spec.bodyPx}px;line-height:1.4;word-break:break-word;">
              ${escapeHtml(body)}
            </div>`
        : "";

    const mediaBottomBlock =
      !useContentBlocks && hasMedia && placement === "bottom"
        ? `<div style="margin-top:10px;">
          ${mediaCoreStack}
        </div>`
        : "";

    const heroBlock =
      !useContentBlocks && hasMedia && placement === "top"
        ? `<div style="margin: -${spec.padY}px -${spec.padX}px 10px -${spec.padX}px;">
          ${mediaCoreHero}
        </div>`
        : "";

    const buttonsHtml = hasMulti
      ? `
        <div id="nexus-cta-stack"
          style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          ${ctaList
            .map((cta, index) => {
              const isPrimary = index === 0;
              const bg = isPrimary ? primaryColor : secondaryColor;
              const color = isPrimary ? primaryTextColor : secondaryTextColor;
              const border = isPrimary ? "" : "border:1px solid #e5e7eb;";
              const label =
                cta.label && cta.label.trim().length
                  ? cta.label
                  : defaultLabelForKind(cta.kind);

              return `
                <button data-cta-index="${index}"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${bg};
                    color:${color};
                    ${border}
                    cursor:pointer;
                    font-weight:600;
                    font-size:13px;
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    text-align:center;
                    box-sizing:border-box;
                    white-space:normal;
                  ">
                  ${escapeHtml(label)}
                </button>
              `;
            })
            .join("")}
        </div>
      `
      : `
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          <button id="nexus-primary"
            style="
              all: unset;
              width:100%;
              min-height:36px;
              padding:0 12px;
              border-radius:8px;
              background:${primaryColor};
              color:${primaryTextColor};
              cursor:pointer;
              font-weight:600;
              font-size:13px;
              display:inline-flex;
              align-items:center;
              justify-content:center;
              text-align:center;
              box-sizing:border-box;
              white-space:normal;
            ">
            ${escapeHtml(payload.primary || "Chat with AI Assistant")}
          </button>
          ${
            payload.secondary !== undefined
              ? `<button id="nexus-secondary"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${secondaryColor};
                    color:${secondaryTextColor};
                    border:1px solid #e5e7eb;
                    cursor:pointer;
                    font-weight:600;
                    font-size:13px;
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    text-align:center;
                    box-sizing:border-box;
                    white-space:normal;
                  ">
                  ${escapeHtml(payload.secondary || "Book a meeting")}
                </button>`
              : ""
          }
        </div>
      `;

    const micHtml = showVoiceMic
      ? `
        <div style="display:flex;justify-content:center;margin-top:10px;">
          <button id="nexus-voice"
            title="Voice call"
            style="
              all: unset;
              width:44px;height:44px;
              border-radius:9999px;
              background:${micBg};
              color:${micFg};
              cursor:pointer;
              display:flex;
              align-items:center;
              justify-content:center;
              box-shadow:0 6px 18px rgba(0,0,0,.18);
              transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease;
            ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M19 11a7 7 0 0 1-14 0" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M12 18v3" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8 21h8" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      `
      : "";

    const privacyBlock = payload.privacyUrl
      ? `<div style="margin-top:10px">
                    <a href="${escapeAttr(
                      payload.privacyUrl,
                    )}" target="_blank" rel="noopener noreferrer"
                      style="color:#6b7280;font-size:11px;text-decoration:underline">
                      This chat may be recorded. View our privacy policy.
                    </a>
                  </div>`
      : "";

    const closeBtnHtml = `<button id="nexus-close" title="Close"
            style="
              all: unset;
              border-radius:9999px;
              width:20px;height:20px;
              display:flex;align-items:center;justify-content:center;
              color:#9ca3af;cursor:pointer;font-size:16px;line-height:16px;
            ">×</button>`;

    const identityCol = `<div style="display:flex;align-items:center;min-width:56px;padding-top:4px">
            ${identityHtml}
          </div>`;

    const buildSideMediaFromBlock = (b: Extract<NudgeContentBlock, { type: "image" } | { type: "video" }>) =>
      wrapNudgeMediaWithCta(
        sideMediaShellFromUrl(
          escapeAttrNudge(b.url),
          b.type === "video",
          mediaHeightNorm,
          effectiveMediaH,
          mediaSurface,
        ),
        promoMediaUrlCtaIndex,
      );

    let mainRowHtml = "";
    if (useContentBlocks && blocksUseSideBySide && singleContentMediaBlock) {
      const textStackHtml = buildContentBlocksStackHtml(
        textBlocksOnly,
        spec,
        effectiveMediaH,
        mediaSurface,
        null,
      );
      const sideMediaHtml = buildSideMediaFromBlock(singleContentMediaBlock);
      const textStackWrapped = textStackHtml
        ? `<div style="margin-top:6px;">${textStackHtml}</div>`
        : "";
      if (rawPlacement === "left") {
        mainRowHtml = `
        <div style="display:flex;gap:10px;align-items:flex-start">
          ${identityCol}
          <div style="flex:1;min-width:0;display:flex;flex-direction:row;gap:10px;align-items:flex-start">
            <div style="width:${spec.splitMediaW}px;flex-shrink:0;">
              ${sideMediaHtml}
            </div>
            <div style="flex:1;min-width:0;">
              ${titleBlock}
              ${textStackWrapped}
              ${micHtml}
              ${buttonsHtml}
              ${privacyBlock}
            </div>
          </div>
          ${closeBtnHtml}
        </div>`;
      } else {
        mainRowHtml = `
        <div style="display:flex;gap:10px;align-items:flex-start">
          ${identityCol}
          <div style="flex:1;min-width:0;display:flex;flex-direction:row;gap:10px;align-items:flex-start">
            <div style="flex:1;min-width:0;">
              ${titleBlock}
              ${textStackWrapped}
              ${micHtml}
              ${buttonsHtml}
              ${privacyBlock}
            </div>
            <div style="width:${spec.splitMediaW}px;flex-shrink:0;">
              ${sideMediaHtml}
            </div>
          </div>
          ${closeBtnHtml}
        </div>`;
      }
    } else if (useContentBlocks) {
      const blocksStackHtml = buildContentBlocksStackHtml(
        contentBlocksNorm,
        spec,
        effectiveMediaH,
        mediaSurface,
        promoMediaUrlCtaIndex,
      );
      const blocksWrapped =
        rawPlacement === "framed" && blocksStackHtml
          ? `<div style="
                margin-top:8px;
                padding:12px;
                border-radius:12px;
                background:#fafafa;
                border:1px solid rgba(229,231,235,.95);
                box-shadow:inset 0 1px 0 rgba(255,255,255,.9);
              ">${blocksStackHtml}</div>`
          : blocksStackHtml
            ? `<div style="margin-top:6px;">${blocksStackHtml}</div>`
            : "";
      mainRowHtml = `
        <div style="display:flex;gap:10px;align-items:flex-start">
          ${identityCol}
          <div style="flex:1;min-width:0;">
            ${titleBlock}
            ${blocksWrapped}
            ${micHtml}
            ${buttonsHtml}
            ${privacyBlock}
          </div>
          ${closeBtnHtml}
        </div>`;
    } else if (placement === "top") {
      mainRowHtml = `
        <div style="display:flex;gap:10px;align-items:flex-start">
          ${identityCol}
          <div style="flex:1;min-width:0;">
            ${titleBlock}
            ${bodyBlock}
            ${micHtml}
            ${buttonsHtml}
            ${privacyBlock}
          </div>
          ${closeBtnHtml}
        </div>`;
    } else if (placement === "left") {
      mainRowHtml = `
        <div style="display:flex;gap:10px;align-items:flex-start">
          ${identityCol}
          <div style="flex:1;min-width:0;display:flex;flex-direction:row;gap:10px;align-items:flex-start">
            <div style="width:${spec.splitMediaW}px;flex-shrink:0;">
              ${hasMedia ? mediaCoreSide : ""}
            </div>
            <div style="flex:1;min-width:0;">
              ${titleBlock}
              ${bodyBlock}
              ${micHtml}
              ${buttonsHtml}
              ${privacyBlock}
            </div>
          </div>
          ${closeBtnHtml}
        </div>`;
    } else if (placement === "right") {
      mainRowHtml = `
        <div style="display:flex;gap:10px;align-items:flex-start">
          ${identityCol}
          <div style="flex:1;min-width:0;display:flex;flex-direction:row;gap:10px;align-items:flex-start">
            <div style="flex:1;min-width:0;">
              ${titleBlock}
              ${bodyBlock}
              ${micHtml}
              ${buttonsHtml}
              ${privacyBlock}
            </div>
            <div style="width:${spec.splitMediaW}px;flex-shrink:0;">
              ${hasMedia ? mediaCoreSide : ""}
            </div>
          </div>
          ${closeBtnHtml}
        </div>`;
    } else if (placement === "framed") {
      const bodyInFrame =
        body.trim().length > 0
          ? `<div style="margin-top:0;color:#4b5563;font-size:${spec.bodyPx}px;line-height:1.4;word-break:break-word;">
              ${escapeHtml(body)}
            </div>`
          : "";
      const mediaInFrame = hasMedia
        ? `<div style="margin-top:${body.trim().length > 0 ? "10px" : "0"};">${mediaCoreStack}</div>`
        : "";
      const framedInner = `${bodyInFrame}${mediaInFrame}`;
      const framedWrap =
        framedInner.trim().length > 0
          ? `<div style="
                margin-top:8px;
                padding:12px;
                border-radius:12px;
                background:#fafafa;
                border:1px solid rgba(229,231,235,.95);
                box-shadow:inset 0 1px 0 rgba(255,255,255,.9);
              ">${framedInner}</div>`
          : "";
      mainRowHtml = `
        <div style="display:flex;gap:10px;align-items:flex-start">
          ${identityCol}
          <div style="flex:1;min-width:0;">
            ${titleBlock}
            ${framedWrap}
            ${micHtml}
            ${buttonsHtml}
            ${privacyBlock}
          </div>
          ${closeBtnHtml}
        </div>`;
    } else {
      mainRowHtml = `
        <div style="display:flex;gap:10px;align-items:flex-start">
          ${identityCol}
          <div style="flex:1;min-width:0;">
            ${titleBlock}
            ${bodyBlock}
            ${mediaBottomBlock}
            ${micHtml}
            ${buttonsHtml}
            ${privacyBlock}
          </div>
          ${closeBtnHtml}
        </div>`;
    }

    nudge!.innerHTML = `
      <div style="position:relative;padding-bottom:8px;box-sizing:border-box;">
        ${heroBlock}
        ${mainRowHtml}
      </div>
    `;

    nudge!.querySelectorAll("video").forEach((el) => {
      const promoVideoEl = el as HTMLVideoElement;
      promoVideoEl.muted = true;
      void promoVideoEl.play().catch(() => {
        /* autoplay policy: attribute may still start playback when allowed */
      });
    });

    const closeBtn = nudge!.querySelector<HTMLButtonElement>("#nexus-close");
    const voiceBtn = nudge!.querySelector<HTMLButtonElement>("#nexus-voice");

    if (showVoiceMic) {
      voiceBtn?.addEventListener("mouseenter", () => {
        if (!voiceBtn) return;
        voiceBtn.style.transform = "scale(1.06)";
        voiceBtn.style.boxShadow = "0 10px 22px rgba(0,0,0,.22)";
      });

      voiceBtn?.addEventListener("mouseleave", () => {
        if (!voiceBtn) return;
        voiceBtn.style.transform = "scale(1)";
        voiceBtn.style.boxShadow = "0 6px 18px rgba(0,0,0,.18)";
      });

      voiceBtn?.addEventListener("click", () => {
        show();
        setTimeout(() => {
          postToWidget({ type: "nexus:open-voice" });
        }, 50);
      });
    }

    if (hasMulti) {
      const btns = nudge!.querySelectorAll<HTMLButtonElement>(
        "button[data-cta-index]",
      );
      btns.forEach((btn) => {
        const idx = Number(btn.getAttribute("data-cta-index") || "0");
        btn.addEventListener("click", () => runNudgeCta(idx));
      });
    }

    nudge!.querySelectorAll("[data-promo-media-cta]").forEach((el) => {
      const idx = Number(el.getAttribute("data-promo-media-cta") || "");
      if (!Number.isInteger(idx) || idx < 0) return;
      const go = () => {
        runNudgeCta(idx);
      };
      el.addEventListener("click", (e) => {
        e.preventDefault();
        go();
      });
      el.addEventListener("keydown", (e) => {
        const ke = e as KeyboardEvent;
        if (ke.key === "Enter" || ke.key === " ") {
          ke.preventDefault();
          go();
        }
      });
    });

    if (!hasMulti) {
      const primaryBtn = nudge!.querySelector<HTMLButtonElement>("#nexus-primary");
      const secondaryBtn = nudge!.querySelector<HTMLButtonElement>("#nexus-secondary");
      primaryBtn?.addEventListener("click", () => openChat());
      secondaryBtn?.addEventListener("click", () => openBooking());
    }

    closeBtn?.addEventListener("click", () => {
      nudgeDismissed = true;
      // If the visitor dismisses the promo, stop the whole nudge flow.
      cancelPromoSequence();
      cancelSuggestions();
      removeNudgeOnly();
    });

    const anim = getPromoAnimationConfig();
    if (nudge) {
      nudge.style.transition = anim.transition;
      nudge.style.opacity = "0";
      nudge.style.transform = anim.hiddenTransform;
    }

    placeNudge();
    if (!isOpen && !nudgeDismissed) {
      requestAnimationFrame(() => {
        if (nudge) {
          const cfg = getPromoAnimationConfig();
          nudge.style.transition = cfg.transition;
          nudge.style.opacity = "1";
          nudge.style.transform = cfg.shownTransform;
        }
        if (caret) caret.style.opacity = "1";
      });
    }
  }

  function runNudgeCta(index: number) {
    const p = pendingPromoPayload;
    let kind: SimpleCta["kind"] | undefined;
    let url: string | undefined;
    if (p?.ctaList && p.ctaList.length > 0) {
      const c = p.ctaList[index];
      kind = c?.kind;
      url = c?.url;
    } else if (p) {
      if (index === 0 && p.primaryCta) {
        kind = p.primaryCta.kind;
        url = p.primaryCta.url;
      } else if (index === 1 && p.secondaryCta) {
        kind = p.secondaryCta.kind;
        url = p.secondaryCta.url;
      }
    }

    pendingCta = { type: "run-cta", index, kind, url };
    show();
    if (pendingCtaTimeout) window.clearTimeout(pendingCtaTimeout);
    pendingCtaTimeout = window.setTimeout(() => {
      if (pendingCta && pendingCta.type === "run-cta") {
        postToWidget({
          type: "nexus:run-cta",
          index: pendingCta.index!,
          kind: pendingCta.kind,
          url: pendingCta.url,
        });
      }
      pendingCtaTimeout = null;
    }, 800);
  }

  function defaultLabelForKind(kind: SimpleCta["kind"]): string {
    if (kind === "open_chat") return "Chat with AI Assistant";
    if (kind === "open_booking") return "Book a meeting";
    return "Open link";
  }

  function placeNudge() {
    if (!button || !nudge || !caret) return;

    const rect = button.getBoundingClientRect();
    const gap = 12;
    const caretSize = 12;
    const fromBottomToButtonTop = window.innerHeight - rect.top;

    nudge.style.bottom = `${fromBottomToButtonTop + gap}px`;
    if (position === "bottom-right") {
      nudge.style.right = "20px";
      (nudge.style as any).left = "";
    } else {
      nudge.style.left = "20px";
      (nudge.style as any).right = "";
    }

    const centerX = rect.left + rect.width / 2;
    caret.style.left = `${centerX - caretSize / 2}px`;
    caret.style.bottom = `${fromBottomToButtonTop + (gap - caretSize / 2)}px`;
    caret.style.transform = "rotate(45deg)";

    const r = nudge.getBoundingClientRect();
    const overflowRight = r.right - window.innerWidth;
    const overflowLeft = -r.left;

    if (overflowRight > 0 && position === "bottom-right") {
      const currRight = parseFloat(getComputedStyle(nudge).right || "20");
      nudge.style.right = `${Math.max(12, currRight + overflowRight)}px`;
    } else if (overflowLeft > 0 && position === "bottom-left") {
      const currLeft = parseFloat(getComputedStyle(nudge).left || "20");
      nudge.style.left = `${Math.max(12, currLeft + overflowLeft)}px`;
    }
  }

  function removeNudge() {
    if (nudge) {
      nudge.remove();
      nudge = null;
    }
    if (caret) {
      caret.remove();
      caret = null;
    }
  }

  function removeNudgeOnly() {
    // Used for auto-close of a single popup in the suggestions sequence:
    // do NOT clear pendingSuggestions or sequence state.
    if (nudge) {
      nudge.remove();
      nudge = null;
    }
    if (caret) {
      caret.remove();
      caret = null;
    }
  }

  function escapeHtml(s: string) {
    return s.replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m]!),
    );
  }

  function escapeAttr(s: string) {
    return s.replace(/"/g, "&quot;");
  }

  /* ---------------- UI actions ---------------- */

  function show() {
    if (!container || !button) return;
    isOpen = true;

    if (nudge) nudge.style.display = "none";
    if (caret) caret.style.display = "none";

    container.style.display = "block";
    setTimeout(() => {
      if (container) {
        container.style.opacity = "1";
        const isFull = embedLayout === "full_width_bottom";
        container.style.transform = isFull ? "translate(-50%, 0)" : "translateY(0)";
      }
    }, 10);

    button.innerHTML = closeIcon;
    applyThemeToFab();
    // Discreet: hide FAB when open (close via header X)
    button.style.opacity = "0";
    button.style.pointerEvents = "none";

    sendParentLocation();
  }

  function hide() {
    if (!container || !button) return;
    isOpen = false;
    pendingCta = null;
    if (pendingCtaTimeout) {
      window.clearTimeout(pendingCtaTimeout);
      pendingCtaTimeout = null;
    }

    container.style.opacity = "0";
    const isFull = embedLayout === "full_width_bottom";
    container.style.transform = isFull ? "translate(-50%, 10px)" : "translateY(10px)";
    setTimeout(() => container && (container.style.display = "none"), 300);

    applyThemeToFab();
    // Restore FAB
    if (fabRevealed) {
      button.style.visibility = "visible";
      button.style.boxShadow = "0 2px 12px rgba(0,0,0,.12)";
    }
    button.style.opacity = "1";
    button.style.pointerEvents = "auto";

    // show nudge back if available
    if (!nudgeDismissed && hasNudgePayload && nudge && caret) {
      nudge.style.display = "block";
      nudge.style.opacity = "1";
      nudge.style.transform = "translateY(0) scale(1)";
      caret.style.display = "block";
      caret.style.opacity = "1";
      placeNudge();
      postToWidget({ type: "nexus:parent-location", href: location.href });
    }
  }

  function openChat() {
    // Visitor started interacting: stop any queued popups immediately.
    cancelSuggestionsSequence();
    cancelPromoSequence();

    pendingCta = { type: "open-chat" };
    show();
    if (pendingCtaTimeout) window.clearTimeout(pendingCtaTimeout);
    pendingCtaTimeout = window.setTimeout(() => {
      if (pendingCta && pendingCta.type === "open-chat") {
        postToWidget({ type: "nexus:open-chat" });
      }
      pendingCtaTimeout = null;
    }, 800);
  }

  function openBooking() {
    // Visitor started interacting: stop any queued popups immediately.
    cancelSuggestionsSequence();
    cancelPromoSequence();

    pendingCta = { type: "run-secondary-cta" };
    show();
    if (pendingCtaTimeout) window.clearTimeout(pendingCtaTimeout);
    pendingCtaTimeout = window.setTimeout(() => {
      if (pendingCta && pendingCta.type === "run-secondary-cta") {
        postToWidget({ type: "nexus:run-secondary-cta" });
      }
      pendingCtaTimeout = null;
    }, 800);
  }

  /* ---------------- Lifecycle ---------------- */

  function destroy() {
    try {
      destroyVisitorTracking();
    } catch {}

    window.removeEventListener("message", handleMessage);
    window.removeEventListener("resize", placeNudge);
    window.removeEventListener("scroll", placeNudge);

    if (unpatchHistory) {
      try {
        unpatchHistory();
      } catch {}
    }
    unpatchHistory = null;

    if (parentLocationPollTimer !== null) {
      window.clearInterval(parentLocationPollTimer);
      parentLocationPollTimer = null;
    }
    if (onVisibilityParentSync) {
      document.removeEventListener("visibilitychange", onVisibilityParentSync);
      onVisibilityParentSync = null;
    }
    if (onWindowFocusParentSync) {
      window.removeEventListener("focus", onWindowFocusParentSync);
      onWindowFocusParentSync = null;
    }

    cancelSuggestionsSequence();
    cancelPromoSequence();
    removeNudge();

    if (container) {
      container.remove();
      container = null;
      iframe = null;
    }
    if (button) {
      button.remove();
      button = null;
    }

    if (fabFallbackRevealTimer !== null) {
      window.clearTimeout(fabFallbackRevealTimer);
      fabFallbackRevealTimer = null;
    }

    isOpen = false;
    iframeLoaded = false;
    TARGET_ORIGIN = "";
    trackingStarted = false;
    trackingSessionId = null;
    theme = null;
    brandLogoUrl = null;
    fabRevealed = false;
    fabEmbedBrandingKnown = false;
    fabRevealForced = false;
    fabFaceGeneration = 0;
    hasNudgePayload = false;
    nudgeDismissed = false;

    // ✅ reset nudge arbitration
    nudgeKind = null;
    pendingSuggestions = null;
    cancelSuggestions();
    pendingCta = null;
    if (pendingCtaTimeout) {
      window.clearTimeout(pendingCtaTimeout);
      pendingCtaTimeout = null;
    }
  }

  function reinit(cfg: { organizationId?: string; position?: "bottom-right" | "bottom-left" }) {
    destroy();
    if (cfg.organizationId) organizationId = cfg.organizationId;
    if (cfg.position) position = cfg.position;
    init();
  }

  (window as any).NexusWidget = { init: reinit, show, hide, destroy };
  init();
})();
