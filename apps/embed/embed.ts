import { EMBED_CONFIG } from "./config";
import { chatBubbleIcon, closeIcon } from "./icons";
import { initVisitorTracking } from "./visitor-tracker";

const NUDGE_ENABLED = false; 

(function () {
  // DOM
  let iframe: HTMLIFrameElement | null = null;
  let container: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let nudge: HTMLDivElement | null = null;
  let caret: HTMLDivElement | null = null;

  // State
  let isOpen = false;
  let hasPromoPayload = false;            // l’iframe a publié une promo personnalisée
  let nudgeDismissed = false;             // l’utilisateur a fermé le nudge
  let iframeLoaded = false;
  let TARGET_ORIGIN = "";

  // Tracking
  let trackingStarted = false;
  let trackingSessionId: string | null = null;

  // Config from <script>
  let organizationId: string | null = null;
  let position: "bottom-right" | "bottom-left" = EMBED_CONFIG.DEFAULT_POSITION;

  // Read attributes
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
      s.hasAttribute("data-organization-id")
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
    console.error("Nexus Widget: data-organization-id attribute is required");
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
    // FAB
    button = document.createElement("button");
    button.id = "nexus-widget-button";
    button.innerHTML = chatBubbleIcon;
    button.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 50%;
      background: #3b82f6; color: white; border: none; cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(59,130,246,.35); transition: transform .2s ease;
    `;
    button.addEventListener("click", () => {
      if (isOpen) {
        hide();
        return;
      }
      openChat();
    });
    button.addEventListener("mouseenter", () => (button!.style.transform = "scale(1.05)"));
    button.addEventListener("mouseleave", () => (button!.style.transform = "scale(1)"));
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
    `;

    // Iframe
    iframe = document.createElement("iframe");
    iframe.src = buildWidgetUrl();
    iframe.allow = "microphone; clipboard-read; clipboard-write";
    iframe.style.cssText = `width:100%;height:100%;border:none;`;
    iframe.onload = () => {
      iframeLoaded = true;
      TARGET_ORIGIN = new URL(iframe!.src).origin;
      postToWidget({ type: "nexus:embed-ready" });
      sendParentLocation();
    };

    container.appendChild(iframe);
    document.body.appendChild(container);

    // Messaging
    window.addEventListener("message", handleMessage);
    patchHistoryForSpa();
    window.addEventListener("popstate", sendParentLocation);

    // Nudge positioning
    window.addEventListener("resize", placeNudge);
    window.addEventListener("scroll", placeNudge, { passive: true });

    // 🔥 Fallback instantané (aucun délai) — remplacé dès réception de nexus:promo
    if (NUDGE_ENABLED && !nudgeDismissed) {
      renderNudge(localFallback());
    }
  }

  function buildWidgetUrl(): string {
    const params = new URLSearchParams();
    params.append("organizationId", organizationId!);
    return `${EMBED_CONFIG.WIDGET_URL}?${params.toString()}`;
  }

  /* ---------------- Messaging ---------------- */

  function handleMessage(event: MessageEvent) {
    if (!iframeLoaded || !TARGET_ORIGIN || event.origin !== TARGET_ORIGIN) return;
    const { type, payload } = event.data || {};

    switch (type) {
      case "close":
        hide();
        break;

      case "resize":
        if (payload?.height && container) container.style.height = `${payload.height}px`;
        break;

      case "nexus:promo":
        // L’iframe envoie la promo… on l’ACK mais on n’affiche rien si le nudge est off
        iframe?.contentWindow?.postMessage({ type: "nexus:host-ack" }, TARGET_ORIGIN);
        iframe?.contentWindow?.postMessage(
          { type: "nexus:hide-internal-promo" },
          TARGET_ORIGIN
        );
        if (NUDGE_ENABLED) {
          hasPromoPayload = true;
          renderNudge(payload);
        }
        break;


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

  function postToWidget(msg: any) {
    if (!iframeLoaded || !iframe?.contentWindow || !TARGET_ORIGIN) return;
    iframe.contentWindow.postMessage(msg, TARGET_ORIGIN);
  }

  function sendParentLocation() {
    postToWidget({ type: "nexus:parent-location", href: location.href });
  }

  function patchHistoryForSpa() {
    (["pushState", "replaceState"] as const).forEach((fn) => {
      const orig = (history as any)[fn];
      (history as any)[fn] = function (...args: any[]) {
        const ret = orig.apply(this, args);
        if (iframeLoaded) sendParentLocation();
        return ret;
      };
    });
  }

  /* ---------------- Nudge ---------------- */

  function localFallback() {
    return {
      title: "Get help fast or schedule time",
      body: "Chat now or book a 15-min demo.",
      primary: "Chat with AI Assistant",
      secondary: "Book a meeting",
      primaryCta: { kind: "open_chat" as const, label: "Chat with AI Assistant" },
      secondaryCta: { kind: "open_booking" as const, label: "Book a meeting" },
      avatars: [] as string[],
    };
  }

  function renderNudge(payload: {
    title?: string;
    body?: string;
    primary?: string;
    secondary?: string;
    primaryCta?: { kind: "open_chat" | "open_booking" | "open_url"; label: string; url?: string };
    secondaryCta?: { kind: "open_chat" | "open_booking" | "open_url"; label: string; url?: string };
    avatars?: string[];
    privacyUrl?: string;
    badgeText?: string;
  }) {
    if (!nudge) {
      nudge = document.createElement("div");
      nudge.id = "nexus-nudge";
      nudge.style.cssText = `
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        padding: 12px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
        opacity: 0; transform: translateY(6px);
        transition: opacity .18s ease, transform .18s ease;
        pointer-events: auto;
      `;
      document.body.appendChild(nudge);

      caret = document.createElement("div");
      caret.style.cssText = `
        position: fixed;
        width: 12px; height: 12px;
        background: #ffffff;
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
    const avatarHtml = avatars
      .map(
        (src, i) => `
      <img src="${escapeAttr(src)}" alt="avatar ${i + 1}"
        style="
          width:26px;height:26px;border-radius:9999px;object-fit:cover;
          border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
          position: relative; ${i ? `margin-left:-10px; z-index:${10 - i};` : "z-index:10;"}
        " />`
      )
      .join("");

    const badgeHtml = payload.badgeText
      ? `<span style="
           position:absolute; left:12px; top:10px;
           background:#10b981; color:#fff; font-size:11px; line-height:1;
           padding:4px 6px; border-radius:6px; font-weight:600;">
           ${escapeHtml(payload.badgeText)}
         </span>`
      : "";

    nudge.innerHTML = `
      <div style="position:relative">
        ${badgeHtml}
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:2px">${avatarHtml}</div>
          <div style="flex:1">
            <div style="font-weight:700">${escapeHtml(
              payload.title || "Discover the right solution for your business project."
            )}</div>
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
          <button id="nexus-close" title="Close"
            style="border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:18px;line-height:18px">×</button>
        </div>
      </div>
    `;

    const primaryBtn = nudge.querySelector<HTMLButtonElement>("#nexus-primary");
    const secondaryBtn = nudge.querySelector<HTMLButtonElement>("#nexus-secondary");
    const closeBtn = nudge.querySelector<HTMLButtonElement>("#nexus-close");

    primaryBtn?.addEventListener("click", () => openChat());
    secondaryBtn?.addEventListener("click", () => openBooking());
    closeBtn?.addEventListener("click", () => {
      nudgeDismissed = true;
      removeNudge();
    });

    placeNudge();
    if (!isOpen && !nudgeDismissed) {
      requestAnimationFrame(() => {
        if (nudge) { nudge.style.opacity = "1"; nudge.style.transform = "translateY(0)"; }
        if (caret) caret.style.opacity = "1";
      });
    }
  }

  function placeNudge() {
    if (!button || !nudge || !caret) return;

    const rect = button.getBoundingClientRect();
    const gap = 12;
    const caretSize = 12;
    const fromBottomToButtonTop = window.innerHeight - rect.top;

    nudge.style.bottom = `${fromBottomToButtonTop + gap}px`;
    if (position === "bottom-right") {
      nudge.style.right = "20px"; nudge.style.left = "";
    } else {
      nudge.style.left = "20px"; nudge.style.right = "";
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
    if (nudge) { nudge.remove(); nudge = null; }
    if (caret) { caret.remove(); caret = null; }
  }

  function escapeHtml(s: string) {
    return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
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

    // ✅ Toujours ré-afficher le nudge si l’utilisateur ne l’a pas volontairement fermé
    if (!nudgeDismissed) {
      if (nudge) { nudge.style.display = "block"; nudge.style.opacity = "1"; nudge.style.transform = "translateY(0)"; }
      if (caret) { caret.style.display = "block"; caret.style.opacity = "1"; }
      placeNudge();
      postToWidget({ type: "nexus:parent-location", href: location.href });
    }
  }

  function openChat() {
    show();
    setTimeout(() => postToWidget({ type: "nexus:open-chat" }), 50);
  }
  function openBooking() {
    show();
    setTimeout(() => postToWidget({ type: "nexus:run-secondary-cta" }), 50);
  }

  /* ---------------- Lifecycle ---------------- */

  function destroy() {
    window.removeEventListener("message", handleMessage);
    window.removeEventListener("popstate", sendParentLocation);
    window.removeEventListener("resize", placeNudge);
    window.removeEventListener("scroll", placeNudge);
    removeNudge();
    if (container) { container.remove(); container = null; iframe = null; }
    if (button) { button.remove(); button = null; }
    isOpen = false;
    iframeLoaded = false;
    TARGET_ORIGIN = "";
    trackingStarted = false;
    trackingSessionId = null;
  }

  function reinit(cfg: { organizationId?: string; position?: "bottom-right" | "bottom-left"; }) {
    destroy();
    if (cfg.organizationId) organizationId = cfg.organizationId;
    if (cfg.position) position = cfg.position;
    init();
  }

  (window as any).NexusWidget = { init: reinit, show, hide, destroy };
  init();
})();
