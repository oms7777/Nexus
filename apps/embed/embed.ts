import { EMBED_CONFIG } from "./config";
import { chatBubbleIcon, closeIcon } from "./icons";

(function () {
  let iframe: HTMLIFrameElement | null = null;
  let container: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let isOpen = false;

  // Config récupérée depuis la balise <script>
  let organizationId: string | null = null;
  let position: "bottom-right" | "bottom-left" = EMBED_CONFIG.DEFAULT_POSITION;

  const currentScript = document.currentScript as HTMLScriptElement | null;
  if (currentScript) {
    organizationId = currentScript.getAttribute("data-organization-id");
    position =
      (currentScript.getAttribute("data-position") as
        | "bottom-right"
        | "bottom-left") || EMBED_CONFIG.DEFAULT_POSITION;
  } else {
    const scripts = document.querySelectorAll('script[src*="embed"]');
    const embedScript = Array.from(scripts).find((s) =>
      s.hasAttribute("data-organization-id")
    ) as HTMLScriptElement | undefined;
    if (embedScript) {
      organizationId = embedScript.getAttribute("data-organization-id");
      position =
        (embedScript.getAttribute("data-position") as
          | "bottom-right"
          | "bottom-left") || EMBED_CONFIG.DEFAULT_POSITION;
    }
  }

  if (!organizationId) {
    console.error("Echo Widget: data-organization-id attribute is required");
    return;
  }

  const WIDGET_ORIGIN = new URL(EMBED_CONFIG.WIDGET_URL).origin;

  /** Envoie l’URL courante de la page hôte à l’iframe */
  function sendParentLocation() {
    try {
      iframe?.contentWindow?.postMessage(
        { type: "nexus:parent-location", href: window.location.href },
        WIDGET_ORIGIN
      );
    } catch {}
  }

  // Patch SPA nav pour notifier l’iframe
  const _push = history.pushState;
  const _replace = history.replaceState;
  function patchHistory() {
    history.pushState = function (...args) {
      // @ts-ignore
      _push.apply(this, args);
      sendParentLocation();
    };
    history.replaceState = function (...args) {
      // @ts-ignore
      _replace.apply(this, args);
      sendParentLocation();
    };
    window.addEventListener("popstate", sendParentLocation);
    window.addEventListener("hashchange", sendParentLocation);
  }
  function unpatchHistory() {
    history.pushState = _push;
    history.replaceState = _replace;
    window.removeEventListener("popstate", sendParentLocation);
    window.removeEventListener("hashchange", sendParentLocation);
  }

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
  }

  function render() {
    // FAB
    button = document.createElement("button");
    button.id = "echo-widget-button";
    button.innerHTML = chatBubbleIcon;
    button.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #3b82f6;
      color: white;
      border: none;
      cursor: pointer;
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 24px rgba(59,130,246,.35);
      transition: all .2s ease;
    `;
    button.addEventListener("click", toggleWidget);
    button.addEventListener("mouseenter", () => (button!.style.transform = "scale(1.05)"));
    button.addEventListener("mouseleave", () => (button!.style.transform = "scale(1)"));
    document.body.appendChild(button);

    // Container
    container = document.createElement("div");
    container.id = "echo-widget-container";
    container.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 90px;
      width: 400px;
      height: 600px;
      max-width: calc(100vw - 40px);
      max-height: calc(100vh - 110px);
      z-index: 999998;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none;
      opacity: 0;
      transform: translateY(10px);
      transition: all .3s ease;
    `;

    // Iframe
    iframe = document.createElement("iframe");
    iframe.src = buildWidgetUrl();
    iframe.allow = "microphone; clipboard-read; clipboard-write";
    iframe.style.cssText = `width:100%;height:100%;border:none;`;
    iframe.addEventListener("load", () => {
      // Assure que l’iframe reçoit l’URL même si postMessage est parti trop tôt
      sendParentLocation();
    });

    container.appendChild(iframe);
    document.body.appendChild(container);

    // Messages venant du widget
    window.addEventListener("message", handleMessage);

    // Écoute la nav du parent
    patchHistory();

    // Premier envoi (au cas où l’iframe charge vite)
    sendParentLocation();
  }

  function buildWidgetUrl(): string {
    const params = new URLSearchParams();
    params.append("organizationId", organizationId!);
    return `${EMBED_CONFIG.WIDGET_URL}?${params.toString()}`;
  }

  function handleMessage(event: MessageEvent) {
    if (event.origin !== WIDGET_ORIGIN) return;
    const { type, payload } = event.data || {};
    if (type === "close") hide();
    if (type === "resize" && payload?.height && container) {
      container.style.height = `${payload.height}px`;
    }
  }

  function toggleWidget() {
    isOpen ? hide() : show();
  }

  function show() {
    if (!container || !button) return;
    isOpen = true;
    container.style.display = "block";
    setTimeout(() => {
      if (!container) return;
      container.style.opacity = "1";
      container.style.transform = "translateY(0)";
    }, 10);
    button.innerHTML = closeIcon;
    sendParentLocation();
  }

  function hide() {
    if (!container || !button) return;
    isOpen = false;
    container.style.opacity = "0";
    container.style.transform = "translateY(10px)";
    setTimeout(() => container && (container.style.display = "none"), 300);
    button.innerHTML = chatBubbleIcon;
    button.style.background = "#3b82f6";
  }

  function destroy() {
    window.removeEventListener("message", handleMessage);
    unpatchHistory();
    if (container) container.remove();
    if (button) button.remove();
    iframe = null;
    container = null;
    button = null;
    isOpen = false;
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

  (window as any).EchoWidget = { init: reinit, show, hide, destroy };

  init();
})();
