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
    // Bouton flottant (logo)
    button = document.createElement("button");
    button.id = "echo-widget-button";
    button.innerHTML = chatBubbleIcon;
    button.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 50%;
      background: #3b82f6; color: white; border: none; cursor: pointer;
      z-index: 1000000; display: flex; align-items: center; justify-content: center;
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
      z-index: 999999; border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease;
    `;

    iframe = document.createElement("iframe");
    iframe.src = buildWidgetUrl();
    iframe.allow = "microphone; clipboard-read; clipboard-write";
    iframe.style.cssText = `width:100%;height:100%;border:none;`;
    iframe.onload = () => sendParentLocation();

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
        if (payload?.height && container) container.style.height = `${payload.height}px`;
        break;
      case "nexus:promo":
        renderNudge(payload); // payload: { title, body, primary, secondary, primaryCta, secondaryCta, avatars?, privacyUrl?, brandName? }
        // cacher la promo interne du widget (éviter le doublon)
        iframe?.contentWindow?.postMessage({ type: "nexus:hide-internal-promo" }, WIDGET_ORIGIN);
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

  // -------- nudge UI (SUSE-like) --------
  function renderNudge(payload: {
    title?: string;
    body?: string;
    primary?: string;
    secondary?: string;
    primaryCta?: unknown;
    secondaryCta?: unknown;
    avatars?: string[];
    privacyUrl?: string;
    brandName?: string;
  }) {
    if (!nudge) {
      nudge = document.createElement("div");
      nudge.id = "echo-nudge";
      nudge.style.cssText = `
        position: fixed;
        ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
        bottom: 92px;
        width: 340px; z-index: 1000001;
        background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        padding: 12px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
      `;
      document.body.appendChild(nudge);
    }

    const avatars = Array.isArray(payload.avatars) && payload.avatars.length
      ? payload.avatars.slice(0, 3)
      : [];

    nudge.innerHTML = `
      <div style="display:flex;gap:10px;align-items:flex-start">
        <!-- avatars stack -->
        <div style="display:flex;gap:4px;min-width:48px;padding-top:2px">
          ${avatars.map((src, i) => `
            <img src="${escapeAttr(src)}" alt="avatar ${i+1}" 
              style="width:24px;height:24px;border-radius:9999px;object-fit:cover;border:1px solid #e5e7eb" />
          `).join("")}
        </div>

        <!-- content -->
        <div style="flex:1">
          <div style="font-weight:700">${escapeHtml(payload.title || "Discover the right solution for your business project.")}</div>
          <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4">${escapeHtml(
            payload.body || "Chat with our assistant or book a 15-min demo."
          )}</div>

          <div style="display:flex;gap:8px;margin-top:12px">
            <button id="nexus-primary"
              style="flex:1;height:36px;border:none;border-radius:8px;background:#0ea5e9;color:#fff;cursor:pointer;font-weight:600">
              ${escapeHtml(payload.primary || "Chat with AI Assistant")}
            </button>
            ${
              payload.secondary !== undefined
                ? `<button id="nexus-secondary"
                     style="flex:1;height:36px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;color:#111827;cursor:pointer;font-weight:600">
                     ${escapeHtml(payload.secondary || "Book a meeting")}
                   </button>`
                : ""
            }
          </div>

          ${
            payload.privacyUrl
              ? `<div style="margin-top:10px">
                   <a href="${escapeAttr(payload.privacyUrl)}" target="_blank" rel="noopener noreferrer"
                      style="color:#6b7280;font-size:11px;text-decoration:underline">
                     This chat may be recorded. View our privacy policy.
                   </a>
                 </div>`
              : ""
          }
        </div>

        <!-- dismiss -->
        <button id="nexus-close" title="Close"
          style="border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:18px;line-height:18px">×</button>
      </div>
    `;

    // handlers
    const primaryBtn = nudge.querySelector<HTMLButtonElement>("#nexus-primary");
    const secondaryBtn = nudge.querySelector<HTMLButtonElement>("#nexus-secondary");
    const closeBtn = nudge.querySelector<HTMLButtonElement>("#nexus-close");

    primaryBtn?.addEventListener("click", () => {
      postToWidget({ type: "nexus:run-primary-cta" });
      show(); // ouvrir le widget
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
  function escapeAttr(s: string) {
    return s.replace(/"/g, "&quot;");
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
