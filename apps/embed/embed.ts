import { EMBED_CONFIG } from "./config";
import { chatBubbleIcon, closeIcon } from "./icons";
import { initVisitorTracking } from "./visitor-tracker";

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
};

(function () {
  const W = window as any;

  // ✅ DEBUG: prove this exact embed bundle is running (no console needed)
  // - Shows an alert (if popups allowed)
  // - Shows a small badge on screen
  // - Kill switch via URL: ?nexus_kill=1
  try {
    const qs = new URL(window.location.href).searchParams;

    // hard kill
    if (qs.get("nexus_kill") === "1") {
      // visual badge so you know kill is active
      const badge = document.createElement("div");
      badge.textContent = "NEXUS EMBED DISABLED (nexus_kill=1)";
      badge.style.cssText =
        "position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#111827;color:#fff;padding:8px 10px;border-radius:10px;font:12px system-ui;opacity:.95";
      document.body.appendChild(badge);
      return;
    }

    if (qs.get("nexus_debug") === "1") {
      // alert (popup)
      try {
        alert("NEXUS EMBED LOADED v999");
      } catch {}

      // on-screen badge (works even if alerts blocked)
      const badge = document.createElement("div");
      badge.textContent = "NEXUS EMBED LOADED v999 (nexus_debug=1)";
      badge.style.cssText =
        "position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#16a34a;color:#fff;padding:8px 10px;border-radius:10px;font:12px system-ui;opacity:.95";
      document.body.appendChild(badge);
    }
  } catch {
    // ignore
  }

  /**
   * ✅ HARD GUARDS
   * - Avoid double injection / HMR / SPA causing infinite listeners and history patches
   */
  if (W.__NEXUS_WIDGET_LOADED__ && W.NexusWidget) return;
  W.__NEXUS_WIDGET_LOADED__ = true;

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

  // Tracking
  let trackingStarted = false;
  let trackingSessionId: string | null = null;

  // Config from <script>
  let organizationId: string | null = null;
  let position: "bottom-right" | "bottom-left" = EMBED_CONFIG.DEFAULT_POSITION;

  // THEME
  let theme: ThemePayload | null = null;
  let brandLogoUrl: string | null = null;

  // Prevent flash
  let fabRevealed = false;

  // ----- Read attributes from <script> -----
  const currentScript = document.currentScript as HTMLScriptElement | null;

  if (currentScript) {
    organizationId = currentScript.getAttribute("data-organization-id");
    position =
      (currentScript.getAttribute("data-position") as
        | "bottom-right"
        | "bottom-left") ?? EMBED_CONFIG.DEFAULT_POSITION;
  } else {
    const scripts = document.querySelectorAll('script[src*="widget"]');
    const embedScript = Array.from(scripts).find((s) =>
      s.hasAttribute("data-organization-id"),
    ) as HTMLScriptElement | undefined;

    if (embedScript) {
      organizationId = embedScript.getAttribute("data-organization-id");
      position =
        (embedScript.getAttribute("data-position") as
          | "bottom-right"
          | "bottom-left") ?? EMBED_CONFIG.DEFAULT_POSITION;
    }
  }

  if (!organizationId) {
    try {
      console.error("Nexus Widget: data-organization-id attribute is required");
    } catch {}
    return;
  }

  /* ---------------- Init ---------------- */

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
  }

  function render() {
    // If already rendered in this page, don't render again
    if (document.getElementById("nexus-widget-button")) return;

    // ----- FAB -----
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
      if (isOpen) {
        hide();
        return;
      }
      openChat();
    });

    button.addEventListener("mouseenter", () => {
      if (!button) return;
      button.style.transform = "scale(1.05)";
      button.style.boxShadow = "0 6px 28px rgba(15,23,42,.35)";
    });

    button.addEventListener("mouseleave", () => {
      if (!button) return;
      button.style.transform = "scale(1)";
      button.style.boxShadow = "0 4px 24px rgba(0,0,0,.25)";
    });

    document.body.appendChild(button);

    // ----- Container -----
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

    // ----- Iframe -----
    iframe = document.createElement("iframe");
    iframe.src = buildWidgetUrl();
    iframe.allow = "microphone; clipboard-read; clipboard-write";
    iframe.style.cssText = `width:100%;height:100%;border:none;`;

    iframe.onload = () => {
      iframeLoaded = true;
      TARGET_ORIGIN = new URL(iframe!.src).origin;

      postToWidget({ type: "nexus:embed-ready" });
      sendParentLocation();
      applyThemeToFab();
    };

    container.appendChild(iframe);
    document.body.appendChild(container);

    // Messaging + SPA patch guarded globally
    attachGlobalListenersOnce();

    // Nudge positioning
    window.addEventListener("resize", placeNudge);
    window.addEventListener("scroll", placeNudge, { passive: true });
  }

  function buildWidgetUrl(): string {
    const params = new URLSearchParams();
    params.append("organizationId", organizationId!);
    return `${EMBED_CONFIG.WIDGET_URL}?${params.toString()}`;
  }

  /* ---------------- Messaging ---------------- */

  function handleMessage(event: MessageEvent) {
    const { type, payload } = event.data || {};

    // Secure origin after iframe loaded
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
        // (tu gardes tes renderSuggestionsNudge ici si besoin)
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

        hasNudgePayload = true;
        theme = promoPayload.theme || theme || null;
        brandLogoUrl = promoPayload.brandLogoUrl || brandLogoUrl || null;

        applyThemeToFab();
        // (tu gardes ton renderNudge ici si besoin)
        break;
      }

      case "nexus:session-ready": {
        if (!organizationId) return;
        if (!payload || typeof payload.sessionId !== "string") return;
        if (trackingStarted) return;

        trackingStarted = true;
        trackingSessionId = payload.sessionId;

        initVisitorTracking({
          orgId: organizationId,
          sessionId: payload.sessionId,
        });

        break;
      }

      default:
        break;
    }
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

  function attachGlobalListenersOnce() {
    const W = window as any;

    if (!W.__NEXUS_WIDGET_GLOBAL_LISTENERS__) {
      W.__NEXUS_WIDGET_GLOBAL_LISTENERS__ = true;

      window.addEventListener("message", handleMessage);
      window.addEventListener("popstate", sendParentLocation);

      patchHistoryForSpa();
    }
  }

  function patchHistoryForSpa() {
    const W = window as any;

    if (W.__NEXUS_WIDGET_HISTORY_PATCHED__) return;
    W.__NEXUS_WIDGET_HISTORY_PATCHED__ = true;

    (["pushState", "replaceState"] as const).forEach((fn) => {
      const orig = (history as any)[fn];
      if (orig && (orig as any).__nexusPatched) return;

      const wrapped = function (this: History, ...args: any[]) {
        const ret = orig.apply(this, args);
        if (iframeLoaded) sendParentLocation();
        return ret;
      };

      (wrapped as any).__nexusPatched = true;
      (history as any)[fn] = wrapped;
    });
  }

  function placeNudge() {
    // (garde ta version complète ici)
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
    sendParentLocation();
  }

  function hide() {
    if (!container || !button) return;
    isOpen = false;

    container.style.opacity = "0";
    container.style.transform = "translateY(10px)";
    setTimeout(() => container && (container.style.display = "none"), 300);

    button.innerHTML = chatBubbleIcon;
    applyThemeToFab();
  }

  function openChat() {
    show();
    setTimeout(() => postToWidget({ type: "nexus:open-chat" }), 50);
  }

  function destroy() {
    window.removeEventListener("resize", placeNudge);
    window.removeEventListener("scroll", placeNudge);

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
  }

  function reinit(cfg: {
    organizationId?: string;
    position?: "bottom-right" | "bottom-left";
  }) {
    destroy();
    if (cfg.organizationId) organizationId = cfg.organizationId;
    if (cfg.position) position = cfg.position;
    init();
  }

  (window as any).NexusWidget = { init: reinit, show, hide, destroy };
  init();
})();
