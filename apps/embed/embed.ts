// apps/embed/embed.ts
import { EMBED_CONFIG } from "./config";
import { chatBubbleIcon, closeIcon } from "./icons";

const NUDGE_ENABLED = true;

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
  primary?: string;
  secondary?: string;
  primaryCta?: SimpleCta;
  secondaryCta?: SimpleCta;
  avatars?: string[];
  badgeText?: string;
  privacyUrl?: string;
  theme?: ThemePayload;
  brandLogoUrl?: string;
  identityMode?: "auto" | "logo" | "avatars";
  ctaList?: SimpleCta[];
  canUseVoice?: boolean;
};

type SuggestionsPayload = {
  greetMessage?: string;
  suggestions: string[];
  privacyUrl?: string;
  theme?: ThemePayload;
  brandLogoUrl?: string;
  canUseVoice?: boolean;
};

(function () {
  try {
    if (window.self !== window.top) return;
  } catch {
    return;
  }

  if ((window as any).__NX_WIDGET_EMBED_LOADED__) return;
  (window as any).__NX_WIDGET_EMBED_LOADED__ = true;

  let iframe: HTMLIFrameElement | null = null;
  let container: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let nudge: HTMLDivElement | null = null;
  let caret: HTMLDivElement | null = null;

  let isOpen = false;
  let hasNudgePayload = false;
  let nudgeDismissed = false;
  let iframeLoaded = false;
  let TARGET_ORIGIN = "";

  let organizationId: string | null = null;
  let position: "bottom-right" | "bottom-left" = EMBED_CONFIG.DEFAULT_POSITION;

  let theme: ThemePayload | null = null;
  let brandLogoUrl: string | null = null;

  let fabRevealed = false;
  let destroyed = false;

  // parent-location anti-freeze
  let lastHrefSent = "";
  let lastHrefSentAt = 0;
  let sendTimer: number | null = null;
  let pendingForce = false;

  // resize anti-freeze
  let lastResizeAt = 0;
  let pendingHeight: number | null = null;
  let resizeTimer: number | null = null;

  const SCROLL_OPTS: AddEventListenerOptions = { passive: true };

  const currentScript = document.currentScript as HTMLScriptElement | null;
  if (currentScript) {
    organizationId = currentScript.getAttribute("data-organization-id");
    position =
      (currentScript.getAttribute("data-position") as any) ??
      EMBED_CONFIG.DEFAULT_POSITION;
  } else {
    const scripts = document.querySelectorAll('script[src*="widget"]');
    const embedScript = Array.from(scripts).find((s) =>
      s.hasAttribute("data-organization-id"),
    ) as HTMLScriptElement | undefined;

    if (embedScript) {
      organizationId = embedScript.getAttribute("data-organization-id");
      position =
        (embedScript.getAttribute("data-position") as any) ??
        EMBED_CONFIG.DEFAULT_POSITION;
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

  function buildWidgetUrl(): string {
    const params = new URLSearchParams();
    params.append("organizationId", organizationId!);
    return `${EMBED_CONFIG.WIDGET_URL}?${params.toString()}`;
  }

  function render() {
    // FAB
    button = document.createElement("button");
    button.id = "nexus-widget-button";
    button.innerHTML = chatBubbleIcon;

    button.style.cssText = `
      all: unset;
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 9999px;
      background: ${theme?.chatBubbleColor || theme?.primaryColor || "#3b82f6"};
      color: ${theme?.primaryTextColor || "#ffffff"};
      cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(0,0,0,.20);
      transition: transform .2s ease, box-shadow .2s ease, background .2s ease, opacity .15s ease;
      opacity: 0;
      pointer-events: none;
    `;

    button.addEventListener("click", () => {
      if (isOpen) hide();
      else openChat();
    });

    document.body.appendChild(button);

    // Container
    container = document.createElement("div");
    container.id = "nexus-widget-container";
    container.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 2147482999;
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease; background: #fff;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
    `;

    iframe = document.createElement("iframe");
    iframe.src = buildWidgetUrl();
    iframe.allow = "microphone; clipboard-read; clipboard-write";
    iframe.style.cssText = `width:100%;height:100%;border:none;`;

    iframe.onload = () => {
      iframeLoaded = true;
      TARGET_ORIGIN = new URL(iframe!.src).origin;

      postToWidget({ type: "nexus:embed-ready" });
      queueParentLocationSend(true);
      applyThemeToFab();
    };

    container.appendChild(iframe);
    document.body.appendChild(container);

    window.addEventListener("message", handleMessage);
    window.addEventListener("resize", placeNudge);
    window.addEventListener("scroll", placeNudge, SCROLL_OPTS);

    window.addEventListener("pagehide", destroy, { once: true });
    window.addEventListener("beforeunload", destroy, { once: true });
  }

  function handleMessage(event: MessageEvent) {
    if (destroyed) return;

    // ✅ HARD FILTER: only accept messages coming from OUR iframe
    if (!iframe?.contentWindow || event.source !== iframe.contentWindow) return;

    const { type, payload } = event.data || {};

    // Security: accept only widget origin after loaded
    if (iframeLoaded && TARGET_ORIGIN && event.origin !== TARGET_ORIGIN) return;

    switch (type) {
      case "close":
        hide();
        break;

      case "resize": {
        const h = Number(payload?.height);
        if (!h || !container) return;
        throttleResize(h);
        break;
      }

      case "nexus:theme": {
        const p = payload as { theme?: ThemePayload; brandLogoUrl?: string };
        theme = p?.theme || null;
        brandLogoUrl = p?.brandLogoUrl || null;
        applyThemeToFab();
        break;
      }

      case "nexus:suggestions": {
        const sp = payload as SuggestionsPayload;
        if (!NUDGE_ENABLED) return;

        hasNudgePayload = true;
        theme = sp.theme || theme || null;
        brandLogoUrl = sp.brandLogoUrl || brandLogoUrl || null;

        applyThemeToFab();
        renderSuggestionsNudge(sp);
        break;
      }

      case "nexus:promo": {
        const promoPayload = payload as PromoPayload;
        if (!NUDGE_ENABLED) return;

        hasNudgePayload = true;
        theme = promoPayload.theme || theme || null;
        brandLogoUrl = promoPayload.brandLogoUrl || brandLogoUrl || null;

        applyThemeToFab();
        renderNudge(promoPayload);
        break;
      }

      default:
        break;
    }
  }

  function throttleResize(height: number) {
    pendingHeight = height;

    const now = Date.now();
    if (now - lastResizeAt > 120) {
      lastResizeAt = now;
      if (container && pendingHeight) container.style.height = `${pendingHeight}px`;
      pendingHeight = null;
      return;
    }

    if (resizeTimer) return;
    resizeTimer = window.setTimeout(() => {
      resizeTimer = null;
      lastResizeAt = Date.now();
      if (container && pendingHeight) container.style.height = `${pendingHeight}px`;
      pendingHeight = null;
    }, 140);
  }

  function postToWidget(msg: any) {
    if (!iframeLoaded || !iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(msg, TARGET_ORIGIN || "*");
  }

  function queueParentLocationSend(force = false) {
    if (!iframeLoaded) return;

    const href = location.href;
    if (!force && href === lastHrefSent) return;

    pendingForce = pendingForce || force;

    if (sendTimer) return;

    sendTimer = window.setTimeout(() => {
      sendTimer = null;

      const latest = location.href;
      const now = Date.now();
      const mustSend = pendingForce || latest !== lastHrefSent;

      pendingForce = false;
      if (!mustSend) return;

      if (now - lastHrefSentAt < 250 && latest === lastHrefSent) return;

      lastHrefSent = latest;
      lastHrefSentAt = now;

      postToWidget({ type: "nexus:parent-location", href: latest });
    }, 350);
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

    const bubbleColor =
      theme?.chatBubbleColor || theme?.primaryColor || "#3b82f6";
    const textColor = theme?.primaryTextColor || "#ffffff";

    button.style.background = bubbleColor;
    button.style.color = textColor;

    revealFabIfNeeded();

    if (isOpen) {
      button.innerHTML = closeIcon;
      return;
    }

    if (brandLogoUrl) {
      const safeLogo = escapeAttr(brandLogoUrl);
      button.innerHTML = `
        <div style="width:70%;height:70%;border-radius:9999px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.9);">
          <img src="${safeLogo}" alt="Chat" style="width:100%;height:100%;object-fit:contain;" />
        </div>
      `;
    } else {
      button.innerHTML = chatBubbleIcon;
    }
  }

  // --- Nudge (tu gardes ton code existant, inchangé) ---
  // Ici je ne recopie pas tout pour pas te spam, MAIS tu peux laisser tes fonctions renderSuggestionsNudge/renderNudge/placeNudge/removeNudge identiques.
  // IMPORTANT: elles ne sont plus appelées en boucle si les messages sont filtrés correctement.

  function renderSuggestionsNudge(_payload: SuggestionsPayload) {
    // garde ton implémentation actuelle
  }

  function renderNudge(_payload: PromoPayload) {
    // garde ton implémentation actuelle
  }

  function placeNudge() {
    // garde ton implémentation actuelle
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

  function escapeAttr(s: string) {
    return s.replace(/"/g, "&quot;");
  }

  function show() {
    if (!container || !button) return;
    isOpen = true;

    if (nudge) nudge.style.display = "none";
    if (caret) caret.style.display = "none";

    container.style.display = "block";
    setTimeout(() => {
      if (container) {
        container.style.opacity = "1";
        container.style.transform = "translateY(0)";
      }
    }, 10);

    button.innerHTML = closeIcon;
    applyThemeToFab();

    queueParentLocationSend(false);
  }

  function hide() {
    if (!container || !button) return;
    isOpen = false;

    container.style.opacity = "0";
    container.style.transform = "translateY(10px)";
    setTimeout(() => container && (container.style.display = "none"), 300);

    button.innerHTML = chatBubbleIcon;
    applyThemeToFab();

    if (!nudgeDismissed && hasNudgePayload && nudge && caret) {
      nudge.style.display = "block";
      nudge.style.opacity = "1";
      caret.style.display = "block";
      caret.style.opacity = "1";
      placeNudge();
      queueParentLocationSend(false);
    }
  }

  function openChat() {
    show();
    setTimeout(() => postToWidget({ type: "nexus:open-chat" }), 50);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;

    try {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("resize", placeNudge);
      window.removeEventListener("scroll", placeNudge as any, SCROLL_OPTS);
    } catch {}

    if (sendTimer) {
      try { window.clearTimeout(sendTimer); } catch {}
    }
    sendTimer = null;
    pendingForce = false;

    if (resizeTimer) {
      try { window.clearTimeout(resizeTimer); } catch {}
    }
    resizeTimer = null;
    pendingHeight = null;

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
    theme = null;
    brandLogoUrl = null;
    fabRevealed = false;
    hasNudgePayload = false;
    nudgeDismissed = false;
    lastHrefSent = "";
    lastHrefSentAt = 0;
  }

  function reinit(cfg: { organizationId?: string; position?: "bottom-right" | "bottom-left" }) {
    destroy();
    destroyed = false;

    if (cfg.organizationId) organizationId = cfg.organizationId;
    if (cfg.position) position = cfg.position;
    init();
  }

  (window as any).NexusWidget = { init: reinit, show, hide, destroy };
  init();
})();
