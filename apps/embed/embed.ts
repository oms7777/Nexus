import { EMBED_CONFIG } from "./config";
import { chatBubbleIcon, closeIcon } from "./icons";

(function () {
  const VERSION = "embed-1.2.1";
  console.log(`[EchoWidget] ${VERSION} | origin=${location.origin}`);

  let iframe: HTMLIFrameElement | null = null;
  let container: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let nudge: HTMLDivElement | null = null;
  let caret: HTMLDivElement | null = null;

  let isOpen = false;
  let nudgeDismissed = false;
  let hasPromoPayload = false;

  let organizationId: string | null = null;
  let position: "bottom-right" | "bottom-left" = EMBED_CONFIG.DEFAULT_POSITION;

  const currentScript = document.currentScript as HTMLScriptElement | null;
  if (currentScript) {
    organizationId = currentScript.getAttribute("data-organization-id");
    position =
      (currentScript.getAttribute("data-position") as "bottom-right" | "bottom-left") ??
      EMBED_CONFIG.DEFAULT_POSITION;
  } else {
    const scripts = document.querySelectorAll('script[src*="widget"]');
    const embedScript = Array.from(scripts).find((s) =>
      s.hasAttribute("data-organization-id"),
    ) as HTMLScriptElement | undefined;
    if (embedScript) {
      organizationId = embedScript.getAttribute("data-organization-id");
      position =
        (embedScript.getAttribute("data-position") as "bottom-right" | "bottom-left") ??
        EMBED_CONFIG.DEFAULT_POSITION;
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
    // Launcher button
    button = document.createElement("button");
    button.id = "nexus-widget-button";
    button.innerHTML = chatBubbleIcon;
    button.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 50%;
      background: #3b82f6; color: white; border: none; cursor: pointer;
      z-index: 2147483000;                  /* ⬅ higher than most sites */
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(59,130,246,.35); transition: transform .2s ease;
    `;
    button.addEventListener("click", toggleWidget);
    button.addEventListener("mouseenter", () => (button!.style.transform = "scale(1.05)"));
    button.addEventListener("mouseleave", () => (button!.style.transform = "scale(1)"));
    document.body.appendChild(button);

    // Panel container + iframe
    container = document.createElement("div");
    container.id = "nexus-widget-container";
    container.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 2147482999;                  /* just under the button */
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease; background: #fff;
    `;

    iframe = document.createElement("iframe");
    iframe.src = buildWidgetUrl();
    iframe.allow = "microphone; clipboard-read; clipboard-write";
    iframe.style.cssText = `width:100%;height:100%;border:none;`;
    iframe.onload = () => {
      postToWidget({ type: "nexus:embed-ready" });
      sendParentLocation();
    };

    container.appendChild(iframe);
    document.body.appendChild(container);

    // Messaging + SPA awareness
    window.addEventListener("message", handleMessage);
    patchHistoryForSpa();
    window.addEventListener("popstate", sendParentLocation);

    // Keep nudge aligned to the button
    window.addEventListener("resize", placeNudge);
    window.addEventListener("scroll", placeNudge, { passive: true });

    // Safety: show local fallback if widget never posts a promo
    window.setTimeout(() => {
      if (!hasPromoPayload && !nudgeDismissed) renderNudge(localFallback());
    }, 1200);
  }

  function buildWidgetUrl(): string {
    const params = new URLSearchParams();
    params.append("organizationId", organizationId!);
    return `${EMBED_CONFIG.WIDGET_URL}?${params.toString()}`;
  }

  // ---------------- Messaging ----------------
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
        hasPromoPayload = true;
        // Acknowledge back so the widget knows the host is listening
        iframe?.contentWindow?.postMessage({ type: "nexus:host-ack" }, WIDGET_ORIGIN);
        renderNudge(payload);
        // Hide the widget’s internal debug promo (avoid duplicates)
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

  // ---------------- Nudge ----------------
  function localFallback() {
    return {
      title: "Get help fast or schedule time",
      body: "Chat now or book a 15-min demo.",
      primary: "Chat with AI Assistant",
      secondary: "Book a meeting",
      primaryCta: { kind: "open_chat", label: "Chat with AI Assistant" },
      secondaryCta: { kind: "open_booking", label: "Book a meeting" },
      avatars: [] as string[],
    };
  }

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
    badgeText?: string;
  }) {
    if (!nudge) {
      nudge = document.createElement("div");
      nudge.id = "nexus-nudge";
      nudge.style.cssText = `
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 1000001;
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
        z-index: 2147483002;                  /* above the nudge */
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `;
      document.body.appendChild(caret);
    }

    const avatars = Array.isArray(payload.avatars) && payload.avatars.length
      ? payload.avatars.slice(0, 3)
      : [];

    const avatarHtml = avatars.map((src, i) => `
      <img src="${escapeAttr(src)}" alt="avatar ${i + 1}"
        style="
          width:26px;height:26px;border-radius:9999px;object-fit:cover;
          border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
          position: relative; ${i ? `margin-left:-10px; z-index:${10 - i};` : "z-index:10;"}
        " />
    `).join("");

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

    // Handlers
    const primaryBtn = nudge.querySelector<HTMLButtonElement>("#nexus-primary");
    const secondaryBtn = nudge.querySelector<HTMLButtonElement>("#nexus-secondary");
    const closeBtn = nudge.querySelector<HTMLButtonElement>("#nexus-close");

    primaryBtn?.addEventListener("click", () => {
      postToWidget({ type: "nexus:run-primary-cta" });
      show();
    });
    secondaryBtn?.addEventListener("click", () => {
      postToWidget({ type: "nexus:run-secondary-cta" });
      show();
    });
    closeBtn?.addEventListener("click", () => {
      nudgeDismissed = true;
      removeNudge();
    });

    // Place & reveal
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

    // Position nudge just above the button; anchor to the same side as the button
    nudge.style.bottom = `${fromBottomToButtonTop + gap}px`;
    if (position === "bottom-right") {
      nudge.style.right = "20px";
      nudge.style.left = "";
    } else {
      nudge.style.left = "20px";
      nudge.style.right = "";
    }

    // Center caret horizontally over the button, just above it
    const centerX = rect.left + rect.width / 2;
    caret.style.left = `${centerX - caretSize / 2}px`;
    caret.style.bottom = `${fromBottomToButtonTop + (gap - caretSize / 2)}px`;
    caret.style.transform = "rotate(45deg)";

    // Clamp nudge inside viewport horizontally if needed
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

  // ---------------- Open / Close ----------------
  function toggleWidget() { isOpen ? hide() : show(); }

  function show() {
    if (!container || !button) return;
    isOpen = true;

    // Fully hide the nudge while the panel is open
    if (nudge) { nudge.style.display = "none"; }
    if (caret) { caret.style.display = "none"; }

    container.style.display = "block";
    setTimeout(() => {
      if (container) {
        container.style.opacity = "1";
        container.style.transform = "translateY(0)";
      }
    }, 10);
    button.innerHTML = closeIcon;
    sendParentLocation();
    postToWidget({ type: "nexus:open-chat" });
  }

  function hide() {
    if (!container || !button) return;
    isOpen = false;

    container.style.opacity = "0";
    container.style.transform = "translateY(10px)";
    setTimeout(() => container && (container.style.display = "none"), 300);
    button.innerHTML = chatBubbleIcon;
    button.style.background = "#3b82f6";

    // Re-show nudge (if not dismissed) and re-place it
    if (hasPromoPayload && !nudgeDismissed) {
      if (nudge) { nudge.style.display = "block"; nudge.style.opacity = "1"; nudge.style.transform = "translateY(0)"; }
      if (caret) { caret.style.display = "block"; caret.style.opacity = "1"; }
      placeNudge();
      postToWidget({ type: "nexus:parent-location", href: location.href });
    }
  }

  // ---------------- Lifecycle ----------------
  function destroy() {
    window.removeEventListener("message", handleMessage);
    window.removeEventListener("popstate", sendParentLocation);
    window.removeEventListener("resize", placeNudge);
    window.removeEventListener("scroll", placeNudge);
    removeNudge();
    if (container) { container.remove(); container = null; iframe = null; }
    if (button) { button.remove(); button = null; }
    isOpen = false;
  }

  function reinit(cfg: { organizationId?: string; position?: "bottom-right" | "bottom-left"; }) {
    destroy();
    if (cfg.organizationId) organizationId = cfg.organizationId;
    if (cfg.position) position = cfg.position;
    init();
  }

  (window as any).EchoWidget = { init: reinit, show, hide, destroy };
  init();
})();
