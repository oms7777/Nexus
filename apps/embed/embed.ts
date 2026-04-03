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
};

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
  };
};

type SuggestionsPayload = {
  greetMessage?: string;
  suggestions: string[];
  privacyUrl?: string;
  theme?: ThemePayload;
  brandLogoUrl?: string;
  canUseVoice?: boolean;
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
  let pendingCta: { type: "run-cta" | "run-secondary-cta" | "open-chat"; index?: number } | null = null;
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

  // éviter flash bleu
  let fabRevealed = false;

  // patchHistory cleanup
  let unpatchHistory: (() => void) | null = null;

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
      background: ${theme?.chatBubbleColor || theme?.primaryColor || "#a855f7"};
      color: ${theme?.primaryTextColor || "#ffffff"};
      cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 12px rgba(0,0,0,.12);
      transition: transform .2s ease, box-shadow .2s ease, background .2s ease, opacity .2s ease;
      opacity: 0;
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

      // start SPA listener after iframe ready
      if (!unpatchHistory) {
        unpatchHistory = patchHistoryForSpa(() => {
          lastNavigationTs = Date.now();
          sendParentLocation();

          // Reschedule pending nudges so they appear a few seconds after each navigation.
          if (
            pendingSuggestions &&
            nudgeKind !== "promo" &&
            !isOpen &&
            !nudgeDismissed
          ) {
            // Restart the suggestions sequence after each navigation.
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

      applyThemeToFab();
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

        const sid = payload?.sessionId;
        if (typeof sid !== "string" || sid.trim().length === 0) return;

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
            postToWidget({ type: "nexus:run-cta", index: pendingCta.index });
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

    if (!promoSequenceItems.length) return;

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

    if (!theme && !brandLogoUrl && !hasNudgePayload) return;

    fabRevealed = true;
    button.style.opacity = "1";
    button.style.pointerEvents = "auto";
  }

  function applyThemeToFab() {
    if (!button) return;


    const bubbleColor = theme?.chatBubbleColor || theme?.primaryColor || "#a855f7";
    const textColor = theme?.primaryTextColor || "#ffffff";

    button.style.background = bubbleColor;
    button.style.color = textColor;

    revealFabIfNeeded();

    // When open, keep close icon (don't override)
    if (isOpen) return;

    if (brandLogoUrl) {
      const safeLogo = escapeAttr(brandLogoUrl);
      button.innerHTML = `
        <div style="
          width:70%;height:70%;
          border-radius:9999px;
          overflow:hidden;
          display:flex;
          align-items:center;
          justify-content:center;
          background:rgba(255,255,255,0.9);
        ">
          <img src="${safeLogo}" alt="Chat"
            style="width:100%;height:100%;object-fit:contain;" />
        </div>
      `;
    } else {
      button.innerHTML = chatBubbleIcon;
    }
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

    const avatars = Array.isArray(payload.avatars) ? payload.avatars.slice(0, 3) : [];

    const ctaList: SimpleCta[] =
      Array.isArray(payload.ctaList) && payload.ctaList.length ? payload.ctaList : [];

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
      payload.title || "Discover the right solution for your business project.";
    const body = payload.body || "Chat with our assistant or book a 15-min demo.";
    const safeImage = payload.imageUrl ? escapeAttr(payload.imageUrl) : "";
    const safeVideo = payload.videoUrl ? escapeAttr(payload.videoUrl) : "";
    const mediaHtml = safeVideo
      ? `
        <div style="margin-top:10px;">
          <video
            src="${safeVideo}"
            muted
            autoplay
            loop
            playsinline
            preload="auto"
            style="width:100%;height:112px;object-fit:cover;border-radius:10px;border:1px solid rgba(229,231,235,.9);background:#f8fafc;"
          ></video>
        </div>
      `
      : safeImage
        ? `
        <div style="margin-top:10px;">
          <img
            src="${safeImage}"
            alt="Promo media"
            style="width:100%;height:112px;object-fit:cover;border-radius:10px;border:1px solid rgba(229,231,235,.9);background:#f8fafc;"
          />
        </div>
      `
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

    const micHtml = canUseVoice
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

    nudge!.innerHTML = `
      <div style="position:relative">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:4px">
            ${identityHtml}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:#111827;">
              ${escapeHtml(title)}
            </div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4;word-break:break-word;">
              ${escapeHtml(body)}
            </div>

            ${mediaHtml}

            ${micHtml}

            ${buttonsHtml}

            ${
              payload.privacyUrl
                ? `<div style="margin-top:10px">
                    <a href="${escapeAttr(
                      payload.privacyUrl,
                    )}" target="_blank" rel="noopener noreferrer"
                      style="color:#6b7280;font-size:11px;text-decoration:underline">
                      This chat may be recorded. View our privacy policy.
                    </a>
                  </div>`
                : ""
            }
          </div>
          <button id="nexus-close" title="Close"
            style="
              all: unset;
              border-radius:9999px;
              width:20px;height:20px;
              display:flex;align-items:center;justify-content:center;
              color:#9ca3af;cursor:pointer;font-size:16px;line-height:16px;
            ">×</button>
        </div>
      </div>
    `;

    const promoVideoEl = nudge!.querySelector("video");
    if (promoVideoEl) {
      promoVideoEl.muted = true;
      void promoVideoEl.play().catch(() => {
        /* autoplay policy: attribute may still start playback when allowed */
      });
    }

    const closeBtn = nudge!.querySelector<HTMLButtonElement>("#nexus-close");
    const voiceBtn = nudge!.querySelector<HTMLButtonElement>("#nexus-voice");

    if (canUseVoice) {
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
    } else {
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
    pendingCta = { type: "run-cta", index };
    show();
    if (pendingCtaTimeout) window.clearTimeout(pendingCtaTimeout);
    pendingCtaTimeout = window.setTimeout(() => {
      if (pendingCta && pendingCta.type === "run-cta") {
        postToWidget({ type: "nexus:run-cta", index: pendingCta.index! });
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

    button.innerHTML = chatBubbleIcon;
    applyThemeToFab();
    // Restore FAB
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

    isOpen = false;
    iframeLoaded = false;
    TARGET_ORIGIN = "";
    trackingStarted = false;
    trackingSessionId = null;
    theme = null;
    brandLogoUrl = null;
    fabRevealed = false;
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
