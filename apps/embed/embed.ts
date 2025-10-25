// apps/embed/src/embed.ts
import { EMBED_CONFIG } from "./config";
import { chatBubbleIcon, closeIcon } from "./icons";

(function () {
  let iframe: HTMLIFrameElement | null = null;
  let container: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let nudge: HTMLDivElement | null = null;
  let isOpen = false;

  // --- config depuis le <script ...>
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
    const scripts = document.querySelectorAll('script[src*="widget"]');
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

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
  }

  function render() {
    // Bouton flottant
    button = document.createElement("button");
    button.id = "echo-widget-button";
    button.innerHTML = chatBubbleIcon;
    button.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 50%;
      background: #3b82f6; color: white; border: none; cursor: pointer;
      z-index: 999999; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(59,130,246,.35); transition: transform .2s ease;
    `;
    button.addEventListener("click", toggleWidget);
    button.addEventListener("mouseenter", () => (button!.style.transform = "scale(1.05)"));
    button.addEventListener("mouseleave", () => (button!.style.transform = "scale(1)"));
    document.body.appendChild(button);

    // Container + iframe (cachés au départ)
    container = document.createElement("div");
    container.id = "echo-widget-container";
    container.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 999998; border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease;
    `;

    iframe = document.createElement("iframe");
    iframe.src = buildWidgetUrl();
    iframe.allow = "microphone; clipboard-read; clipboard-write";
    iframe.style.cssText = `width:100%;height:100%;border:none;`;
    iframe.onload = () => {
      // envoyer l’URL hôte au widget
      sendParentLocation();
    };

    container.appendChild(iframe);
    document.body.appendChild(container);

    // messages -> host
    window.addEventListener("message", handleMessage);

    // publier les changements d’URL (SPA)
    patchHistoryForSpa();
    window.addEventListener("popstate", sendParentLocation);
  }

  function buildWidgetUrl(): string {
    const params = new URLSearchParams();
    params.append("organizationId", organizationId!);
    return `${EMBED_CONFIG.WIDGET_URL}?${params.toString()}`;
  }

  // -------- messaging --------
  function handleMessage(event: MessageEvent) {
    if (event.origin !== WIDGET_ORIGIN) return;
    const { type, payload } = event.data || {};

    switch (type) {
      case "close":
        hide();
        break;
      case "resize":
        if (payload?.height && container) {
          container.style.height = `${payload.height}px`;
        }
        break;
      case "nexus:promo":
        // payload: { title, body, primary, secondary, primaryCta, secondaryCta }
        renderNudge(payload);
        // cacher la promo interne du widget (éviter le doublon)
        iframe?.contentWindow?.postMessage(
          { type: "nexus:hide-internal-promo" },
          WIDGET_ORIGIN
        );
        break;
      default:
        break;
    }
  }

  function postToWidget(msg: any) {
    iframe?.contentWindow?.postMessage(msg, WIDGET_ORIGIN);
  }

  function sendParentLocation() {
    postToWidget({ type: "nexus:parent-location", href: location.href });
  }

  function patchHistoryForSpa() {
    (["pushState", "replaceState"] as const).forEach((fn) => {
      const orig = (history as any)[fn];
      (history as any)[fn] = function (...args: any[]) {
        const ret = orig.apply(this, args);
        sendParentLocation();
        return ret;
      };
    });
  }

  // -------- nudge UI --------
  function renderNudge(payload: {
    title?: string;
    body?: string;
    primary?: string;
    secondary?: string;
    primaryCta?: unknown;
    secondaryCta?: unknown;
  }) {
    if (!nudge) {
      nudge = document.createElement("div");
      nudge.id = "echo-nudge";
      nudge.style.cssText = `
        position: fixed;
        ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
        bottom: 90px;
        width: 320px; z-index: 999997;
        background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        padding: 12px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
      `;
      document.body.appendChild(nudge);
    }

    nudge.innerHTML = `
      <div style="display:flex;gap:8px;align-items:flex-start">
        <div style="flex:1">
          <div style="font-weight:600">${escapeHtml(payload.title || "Need a hand?")}</div>
          <div style="margin-top:4px;color:#6b7280;font-size:14px">${escapeHtml(
            payload.body || "Chat with our assistant or book a 15-min demo."
          )}</div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button id="nexus-primary" style="flex:1;height:32px;border:none;border-radius:8px;background:#111827;color:#fff;cursor:pointer">
              ${escapeHtml(payload.primary || "Chat with AI Assistant")}
            </button>
            ${
              payload.secondary !== undefined
                ? `<button id="nexus-secondary" style="flex:1;height:32px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;color:#111827;cursor:pointer">
                     ${escapeHtml(payload.secondary || "Book a meeting")}
                   </button>`
                : ""
            }
          </div>
        </div>
        <button id="nexus-close" title="Close" style="border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:18px;line-height:18px">×</button>
      </div>
    `;

    // handlers
    const primaryBtn = nudge.querySelector<HTMLButtonElement>("#nexus-primary");
    const secondaryBtn = nudge.querySelector<HTMLButtonElement>("#nexus-secondary");
    const closeBtn = nudge.querySelector<HTMLButtonElement>("#nexus-close");

    primaryBtn?.addEventListener("click", () => {
      postToWidget({ type: "nexus:run-primary-cta" });
      show(); // ouvrir le widget si besoin
    });
    secondaryBtn?.addEventListener("click", () => {
      postToWidget({ type: "nexus:run-secondary-cta" });
      show();
    });
    closeBtn?.addEventListener("click", () => {
      nudge?.remove();
      nudge = null;
    });
  }

  function escapeHtml(s: string) {
    return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
  }

  // -------- open / close --------
  function toggleWidget() { isOpen ? hide() : show(); }

  function show() {
    if (!container || !button) return;
    isOpen = true;
    container.style.display = "block";
    setTimeout(() => {
      if (container) {
        container.style.opacity = "1";
        container.style.transform = "translateY(0)";
      }
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

  // -------- lifecycle --------
  function destroy() {
    window.removeEventListener("message", handleMessage);
    window.removeEventListener("popstate", sendParentLocation);
    if (nudge) { nudge.remove(); nudge = null; }
    if (container) { container.remove(); container = null; iframe = null; }
    if (button) { button.remove(); button = null; }
    isOpen = false;
  }

  function reinit(newConfig: { organizationId?: string; position?: "bottom-right" | "bottom-left"; }) {
    destroy();
    if (newConfig.organizationId) organizationId = newConfig.organizationId;
    if (newConfig.position) position = newConfig.position;
    init();
  }

  (window as any).EchoWidget = { init: reinit, show, hide, destroy };

  init();
})();
